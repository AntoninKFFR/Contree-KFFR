import { SoloFailure, uuidPattern, type Card, type NativeSoloSession, type SoloIntent } from "./contract";
import type { SoloApi, SoloIdentity } from "./api";
import { buildCustomRuleset, rulesetToCustomInput, type CustomRulesetInput } from "../../../../engine/rulesets/custom";

export type SoloStorage = { getItem: (key: string) => Promise<string | null>; setItem: (key: string, value: string) => Promise<unknown> };
export type SoloState = { session: NativeSoloSession | null; busy: boolean; hydrated: boolean; active: boolean; requiresSync: boolean; error: string | null; pendingCard: Card | null };
export const initialSoloState: SoloState = { session: null, busy: false, hydrated: false, active: false, requiresSync: false, error: null, pendingCard: null };
export const soloStorageKey = (userId: string) => "kffr-native-solo:v1:" + encodeURIComponent(userId);
type Bookmark = { sessionId: string | null; startKey: string | null; rules?: CustomRulesetInput };

/** Owns a single verified identity/focus lifetime. No cached private game is persisted. */
export function createSoloController(options: {
  owner: string; identity: () => SoloIdentity | null; api: SoloApi; storage: SoloStorage;
  uuid: () => string; onChange: (state: SoloState) => void; unauthorized: () => void;
}) {
  const { owner, identity, api, storage, uuid, onChange, unauthorized } = options;
  let state = { ...initialSoloState }, disposed = false, generation = 0;
  let request: AbortController | null = null;
  const key = soloStorageKey(owner);
  const update = (patch: Partial<SoloState>) => { state = { ...state, ...patch }; if (!disposed) onChange(state); };
  async function bookmark(): Promise<Bookmark> {
    const raw = await storage.getItem(key);
    if (raw === null) return { sessionId: null, startKey: null };
    try {
      const data = JSON.parse(raw) as Bookmark;
      if (!data || ![data.sessionId, data.startKey].every((id) => id === null || typeof id === "string" && uuidPattern.test(id))) throw new Error();
      return { sessionId: data.sessionId, startKey: data.startKey, ...(data.rules === undefined ? {} : { rules: rulesetToCustomInput(buildCustomRuleset(data.rules)) }) };
    } catch { throw new SoloFailure("La reprise locale est illisible. Aucune donnée n’a été effacée.", 0, "storage"); }
  }
  const save = (data: Bookmark) => storage.setItem(key, JSON.stringify(data));
  async function run(work: (who: SoloIdentity, signal: AbortSignal, current: () => boolean) => Promise<void>) {
    if (disposed || state.busy) return;
    const who = identity();
    if (!who || who.user.id !== owner) { update({ session: null, error: "Vérifie ton compte avant de jouer." }); return; }
    const revision = ++generation;
    request = new AbortController();
    const current = () => !disposed && revision === generation && identity()?.user.id === owner && identity()?.access_token === who.access_token;
    update({ busy: true, error: null });
    try { await work(who, request.signal, current); }
    catch (error) {
      if (!current()) return;
      const failure = error instanceof SoloFailure ? error : new SoloFailure("La sauvegarde locale ou le réseau est indisponible. Réessaie.", 0, "storage");
      if (failure.status === 401) { update({ session: null, active: false, requiresSync: true, error: failure.message }); unauthorized(); }
      else update({ error: failure.message, requiresSync: failure.status !== 400 });
    } finally { if (current()) { request = null; update({ busy: false, hydrated: true, pendingCard: null }); } }
  }
  function accept(next: NativeSoloSession) {
    if (state.session && next.id === state.session.id && next.version < state.session.version) throw new SoloFailure("État serveur obsolète. Recharge la partie.", 0, "version");
    update({ session: next, requiresSync: false });
  }
  async function load() {
    return run(async (who, signal, current) => {
      const saved = await bookmark(); if (!current()) return;
      if (!saved.sessionId) { update({ session: null, requiresSync: false }); return; }
      try { const next = await api.load(who, signal, saved.sessionId); if (current()) { accept(next); update({ active: true }); } }
      catch (error) {
        if (error instanceof SoloFailure && error.status === 404 && current()) {
          await save({ ...saved, sessionId: null });
          if (current()) update({ session: null, active: false, requiresSync: false, error: "Cette partie a été supprimée du serveur." });
        } else throw error;
      }
    });
  }
  return {
    owner, get state() { return state; }, load,
    start: (rules: CustomRulesetInput = { presetId: "contree-kffr" }) => run(async (who, signal, current) => {
      const saved = await bookmark(); if (!current()) return;
      const startKey = saved.startKey ?? uuid();
      if (!uuidPattern.test(startKey)) throw new SoloFailure("Impossible de préparer la partie.", 0, "uuid");
      const preparedRules = saved.startKey ? saved.rules ?? { presetId: "contree-kffr" as const } : rulesetToCustomInput(buildCustomRuleset(rules));
      await save({ ...saved, startKey, rules: preparedRules }); if (!current()) return;
      const next = await api.start(who, signal, startKey, preparedRules); if (!current()) return;
      await save({ sessionId: next.id, startKey: null }); if (!current()) return;
      // A deliberately new session can have a lower version than the old bookmark.
      update({ session: next, active: true, requiresSync: false });
    }),
    resume: () => { if (!disposed && state.hydrated && !state.busy && !state.requiresSync && state.session) update({ active: true, error: null }); },
    move: (intent: SoloIntent) => run(async (who, signal, current) => {
      const previous = state.session;
      if (!previous || !state.active || state.requiresSync) return;
      // Presentation feedback only. Keep the authoritative hand/trick untouched
      // until the validated server reply, including on refusal or disconnect.
      if (intent.type === "play-card") update({ pendingCard: intent.card });
      const next = await api.move(who, signal, previous, intent); if (!current()) return;
      if (next.version <= previous.version) throw new SoloFailure("Action non confirmée. Recharge la partie.", 0, "version");
      accept(next);
    }),
    suspend: () => { ++generation; request?.abort(); request = null; update({ ...initialSoloState }); },
    dispose: () => { disposed = true; ++generation; request?.abort(); request = null; state = { ...initialSoloState }; },
  };
}
