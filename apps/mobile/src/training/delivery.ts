import type { TrainingSeriesSubmission } from "@/engine/training/seriesContract";
import type { TrainingStorage } from "./storage";
import { TrainingApiError } from "./api";
type Receipt = { version: 1; state: "sending" | "saved" | "retryable" | "rejected"; body: TrainingSeriesSubmission };
const deliveries = new Map<string, Promise<void>>();
/** The existing server has no idempotency key. Persist BEFORE POST and never
 * resend an ambiguous write: a later tap can only reconcile its server history. */
export class TrainingSeriesDelivery {
  constructor(private storage: TrainingStorage, private userId: string,
    private send: (body: TrainingSeriesSubmission, signal: AbortSignal) => Promise<unknown>,
    private exists: (body: TrainingSeriesSubmission, signal: AbortSignal) => Promise<boolean>) {}
  deliver(receipt: string, body: TrainingSeriesSubmission, signal: AbortSignal): Promise<void> {
    const key = `${this.userId}:${receipt}`;
    const current = deliveries.get(key); if (current) return current;
    const operation = this.run(receipt, body, signal).finally(() => deliveries.delete(key));
    deliveries.set(key, operation); return operation;
  }
  private async run(receipt: string, body: TrainingSeriesSubmission, signal: AbortSignal) {
    const key = `coinche:ios-training-delivery:v1:${encodeURIComponent(this.userId)}:${receipt}`;
    const raw = await this.storage.getItem(key);
    let previous: Receipt | null = null;
    if (raw) {
      try { previous = JSON.parse(raw); } catch { throw Error("Reçu serveur illisible. Conservé sans nouvel envoi."); }
      if (!previous || previous.version !== 1 || JSON.stringify(previous.body) !== JSON.stringify(body)) throw Error("Reçu serveur incompatible. Aucun nouvel envoi.");
      if (previous.state === "saved") return;
      if (previous.state === "sending") {
        if (await this.exists(body, signal)) { await this.storage.setItem(key, JSON.stringify({ ...previous, state: "saved" })); return; }
        throw Error("Envoi précédent incertain. Aucun renvoi pour éviter une double série ; vérifie ultérieurement les records du compte.");
      }
      if (previous.state === "rejected") throw Error("Série refusée par le serveur. Le résultat local est conservé.");
    }
    if (signal.aborted) throw Error("Envoi interrompu avant sa préparation.");
    const staged: Receipt = { version: 1, state: "sending", body };
    await this.storage.setItem(key, JSON.stringify(staged));
    try {
      await this.send(body, signal);
      await this.storage.setItem(key, JSON.stringify({ ...staged, state: "saved" }));
    } catch (error) {
      if (error instanceof TrainingApiError && error.status >= 400 && error.status < 500) {
        await this.storage.setItem(key, JSON.stringify({ ...staged, state: error.status === 401 || error.status === 429 ? "retryable" : "rejected" }));
      }
      throw error;
    }
  }
}
