import { emptyTrainingProgress, parseTrainingProgress, type TrainingProgress } from "../../../../lib/training/progress";

export type TrainingStorage = { getItem(key: string): Promise<string | null>; setItem(key: string, value: string): Promise<void> };
type Envelope = { version: 1; progress: TrainingProgress; receipts: string[] };
export const trainingStorageKey = (userId: string) => `coinche:ios-training-progress:v1:${encodeURIComponent(userId)}`;

/** All writes for this identity are serialized, including reads before writes. */
export class TrainingProgressStore {
  private tail: Promise<unknown> = Promise.resolve();
  readonly key: string;
  constructor(private storage: TrainingStorage, userId: string) {
    if (!userId) throw new Error("Une identité est nécessaire pour la progression locale.");
    this.key = trainingStorageKey(userId);
  }
  private async read(): Promise<Envelope> {
    const raw = await this.storage.getItem(this.key);
    if (raw === null) return { version: 1, progress: emptyTrainingProgress(), receipts: [] };
    let parsed: unknown;
    try { parsed = JSON.parse(raw); } catch {
      // Keep the original for recovery before allowing a fresh progression.
      await this.storage.setItem(this.key + ":recovery", raw);
      return { version: 1, progress: emptyTrainingProgress(), receipts: [] };
    }
    if (!parsed || typeof parsed !== "object" || !("version" in parsed) || parsed.version !== 1) {
      throw new Error("Format de progression inconnu. Données conservées ; mise à jour nécessaire.");
    }
    if ("axes" in parsed) return { version: 1, progress: parseTrainingProgress(raw), receipts: [] };
    const value = parsed as Partial<Envelope>;
    if (!value.progress || value.progress.version !== 1 || !Array.isArray(value.receipts) || value.receipts.some((id) => typeof id !== "string")) {
      await this.storage.setItem(this.key + ":recovery", raw);
      return { version: 1, progress: emptyTrainingProgress(), receipts: [] };
    }
    return { version: 1, progress: parseTrainingProgress(JSON.stringify(value.progress)), receipts: value.receipts };
  }
  async load(): Promise<TrainingProgress> { await this.tail; return (await this.read()).progress; }
  commit(receipt: string, update: (progress: TrainingProgress) => TrainingProgress): Promise<TrainingProgress> {
    const operation = this.tail.then(async () => {
      const envelope = await this.read();
      if (envelope.receipts.includes(receipt)) return envelope.progress;
      const progress = update(envelope.progress);
      await this.storage.setItem(this.key, JSON.stringify({ version: 1, progress, receipts: [...envelope.receipts, receipt] } satisfies Envelope));
      return progress;
    });
    this.tail = operation.catch(() => undefined);
    return operation;
  }
}
