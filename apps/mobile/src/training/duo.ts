import { createTrainingDuoClient, TrainingDuoApiError } from "@/lib/trainingDuoApi";
import type { TrainingDuoIntent, TrainingDuoView } from "@/lib/trainingDuoTypes";
import { SOLO_ORIGIN, type SoloIdentity } from "../solo/api";
import type { TrainingStorage } from "./storage";
import type { BidReadingLevel } from "@/engine/training/bidReading";
import { uuidPattern } from "../solo/contract";
export function validateDuoView(view: TrainingDuoView) {
  if (!view || !view.session || !uuidPattern.test(view.session.id) || view.session.axisId !== "bid-reading" || view.session.rulesetId !== "contree-kffr" || view.session.seriesLength !== 10 || ![1, 2, 3, 4].includes(view.session.level) || view.session.axisVersion !== 1 || view.session.generatorVersion !== 1 || view.session.rulesetVersion !== 1 || view.session.doctrineRevision !== "4.1" || view.session.doctrineId !== "advanced_rules_v4" || !Number.isInteger(view.session.stateVersion) || ![0, 1].includes(view.viewerSlot)) throw Error("Version de session Duo non prise en charge. Mets l’application à jour.");
  if (!Array.isArray(view.participants) || view.participants.length > 2 || !view.participants.some((p) => p.slot === view.viewerSlot) || new Set(view.participants.map((p) => p.slot)).size !== view.participants.length) throw Error("Participants Duo invalides.");
  if (view.exercise && view.session.questionPhase === "answering" && (view.exercise.kind !== "public" || "promise" in view.exercise || "answers" in view.exercise || "illustrationHand" in view.exercise || "seed" in view.exercise)) throw Error("Projection Duo invalide.");
  return view;
}
export type DuoState = { view: TrainingDuoView | null; busy: boolean; error: string | null; terminal: boolean };
/** A mutation never publishes after dispose; incoming presence cannot roll versions back. */
export class NativeDuoController {
  state: DuoState = { view: null, busy: false, error: null, terminal: false };
  private abort = new AbortController(); private live = true; private loading: string | null = null;
  private generation = 0;
  private client: ReturnType<typeof createTrainingDuoClient>;
  readonly storageKey: string;
  constructor(private identity: SoloIdentity, private storage: TrainingStorage, private changed: () => void, fetcher: typeof fetch = fetch) {
    this.storageKey = `coinche:ios-training-duo:v1:${identity.user.id}`;
    const bounded: typeof fetch = async (url, init) => {
      if (identity.expires_at !== undefined && identity.expires_at * 1000 <= Date.now()) throw new TrainingDuoApiError("Session expirée. Reconnecte-toi.", 401, "expired");
      const request = new AbortController(), abort = () => request.abort();
      const outer = init?.signal;
      outer?.addEventListener("abort", abort, { once: true }); if (outer?.aborted) abort();
      const timer = setTimeout(abort, 15000);
      try { return await fetcher(url, { ...init, signal: request.signal, redirect: "error" }); }
      finally { clearTimeout(timer); outer?.removeEventListener("abort", abort); }
    };
    this.client = createTrainingDuoClient({ origin: SOLO_ORIGIN, signal: this.abort.signal, fetcher: bounded });
  }
  private publish() { if (this.live) this.changed(); }
  private accept(value: TrainingDuoView) {
    if (!this.live) return;
    const next = validateDuoView(value), previous = this.state.view;
    if (previous?.session.id === next.session.id && previous.session.stateVersion > next.session.stateVersion) return;
    this.state = { ...this.state, view: next, error: null, terminal: false }; this.publish();
  }
  private fail(error: unknown) {
    if (!this.live) return;
    const terminal = error instanceof TrainingDuoApiError && ["duo_session_expired", "duo_version_unsupported", "duo_session_not_found", "duo_not_member"].includes(error.code);
    this.state = { ...this.state, error: error instanceof Error ? error.message : "Connexion Duo interrompue.", terminal };
    this.publish();
  }
  async resume() {
    try { const id = await this.storage.getItem(this.storageKey); if (id && uuidPattern.test(id) && this.live) await this.load(id); }
    catch (e) { this.fail(e); }
  }
  private async mutation(operation: () => Promise<TrainingDuoView | null>) {
    if (!this.live || this.state.busy) return;
    this.generation++;
    this.state = { ...this.state, busy: true, error: null }; this.publish();
    try {
      const next = await operation();
      if (!this.live) return;
      if (next) { this.accept(next); await this.storage.setItem(this.storageKey, next.session.id); }
      else { await this.storage.setItem(this.storageKey, ""); this.state = { ...this.state, view: null }; }
    } catch (e) { this.fail(e); }
    finally { if (this.live) { this.state = { ...this.state, busy: false }; this.publish(); } }
  }
  create(level: BidReadingLevel) { return this.mutation(() => this.client.createTrainingDuoSession(level, this.identity)); }
  join(code: string) { return this.mutation(() => this.client.joinTrainingDuoSession(code.trim().toUpperCase(), this.identity)); }
  async load(id = this.state.view?.session.id) {
    if (!id || !this.live || this.loading === id) return;
    if (!uuidPattern.test(id)) { this.fail(Error("Identifiant de session Duo invalide.")); return; }
    if (this.state.view?.session.id !== id) this.generation++;
    this.loading = id;
    const generation = this.generation;
    try { const next = await this.client.fetchTrainingDuoView(id, this.identity); if (generation === this.generation) { if (next.session.id !== id) throw Error("La réponse ne correspond pas à cette session."); this.accept(next); if (this.live) await this.storage.setItem(this.storageKey, id); } } catch (e) { if (generation === this.generation) this.fail(e); }
    finally { if (this.loading === id) this.loading = null; }
  }
  async presence() {
    const id = this.state.view?.session.id;
    if (!id || !this.live || this.state.busy || this.state.terminal || !["lobby", "active"].includes(this.state.view!.session.status)) return;
    const generation = this.generation;
    try { const next = await this.client.sendTrainingDuoPresence(id, this.identity); if (generation === this.generation && next.session.id === id) this.accept(next); } catch { if (generation === this.generation) await this.load(id); }
  }
  intent(intent: TrainingDuoIntent) { const view = this.state.view; return view ? this.mutation(() => this.client.sendTrainingDuoIntentWithRetry(view, intent, this.identity)) : Promise.resolve(); }
  async closeCompleted() { try { if (this.state.view && ["completed", "cancelled"].includes(this.state.view.session.status)) { this.generation++; await this.storage.setItem(this.storageKey, ""); if (this.live) { this.state = { view: null, busy: false, error: null, terminal: false }; this.publish(); } } } catch (e) { this.fail(e); } }
  dispose() { this.live = false; this.abort.abort(); this.state = { view: null, busy: false, error: null, terminal: false }; }
}
