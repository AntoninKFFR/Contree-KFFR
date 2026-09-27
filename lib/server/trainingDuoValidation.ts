import "server-only";
import { BID_READING_ASSERTION_LABELS, type BidReadingLevel } from "@/engine/training/bidReading";
import type { BidPromiseAssertion } from "@/bots/strategy/advancedRulesBidReading";
import type { TrainingDuoIntent } from "@/lib/trainingDuoTypes";
import { TrainingDuoError } from "./trainingDuoError";

export const DUO_MAX_BODY_BYTES = 2_048;
const ASSERTIONS = new Set(Object.keys(BID_READING_ASSERTION_LABELS));
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseDuoSessionId(value: string): string {
  if (!UUID.test(value)) throw new TrainingDuoError("duo_session_not_found");
  return value;
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function keys(value: Record<string, unknown>, expected: string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === expected.length && expected.every((key) => Object.hasOwn(value, key));
}

export function parseCreateDuo(value: unknown): { level: BidReadingLevel } {
  if (!record(value) || !keys(value, ["level"]) || ![1, 2, 3, 4].includes(value.level as number)) {
    throw new TrainingDuoError("duo_invalid_request");
  }
  return { level: value.level as BidReadingLevel };
}

export function parseJoinDuo(value: unknown): { code: string } {
  if (!record(value) || !keys(value, ["code"]) || typeof value.code !== "string") {
    throw new TrainingDuoError("duo_invalid_request");
  }
  const code = value.code.trim().toUpperCase();
  if (code.length !== 10 || [...code].some((character) => !CODE_CHARS.includes(character))) {
    throw new TrainingDuoError("duo_session_not_found");
  }
  return { code };
}

export function parseDuoIntent(value: unknown): TrainingDuoIntent {
  if (!record(value) || typeof value.type !== "string") throw new TrainingDuoError("duo_invalid_request");
  if (value.type === "set-ready" && keys(value, ["type", "ready"]) && typeof value.ready === "boolean") {
    return { type: "set-ready", ready: value.ready };
  }
  if (["start", "ready-next", "leave", "cancel"].includes(value.type) && keys(value, ["type"])) {
    return { type: value.type as "start" | "ready-next" | "leave" | "cancel" };
  }
  if (value.type === "submit-answer" && keys(value, ["type", "answer"]) && record(value.answer)
    && keys(value.answer, ["selectedAssertionIds"]) && Array.isArray(value.answer.selectedAssertionIds)) {
    const selected = value.answer.selectedAssertionIds;
    if (selected.length > ASSERTIONS.size || selected.some((id) => typeof id !== "string" || !ASSERTIONS.has(id))
      || new Set(selected).size !== selected.length) throw new TrainingDuoError("duo_invalid_answer");
    return { type: "submit-answer", answer: { selectedAssertionIds: selected as BidPromiseAssertion[] } };
  }
  throw new TrainingDuoError(value.type === "submit-answer" ? "duo_invalid_answer" : "duo_invalid_request");
}

export function parseDuoMutation(value: unknown): { expectedVersion: number; intent: TrainingDuoIntent } {
  if (!record(value) || !keys(value, ["expectedVersion", "intent"])
    || !Number.isSafeInteger(value.expectedVersion) || Number(value.expectedVersion) < 0) {
    throw new TrainingDuoError("duo_invalid_request");
  }
  return { expectedVersion: value.expectedVersion as number, intent: parseDuoIntent(value.intent) };
}

export async function readBoundedDuoText(request: Request): Promise<string> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > DUO_MAX_BODY_BYTES) throw new TrainingDuoError("duo_invalid_request");
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > DUO_MAX_BODY_BYTES) {
      await reader.cancel();
      throw new TrainingDuoError("duo_invalid_request");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(bytes);
}

export async function readDuoJson(request: Request): Promise<unknown> {
  const body = await readBoundedDuoText(request);
  try { return JSON.parse(body) as unknown; }
  catch { throw new TrainingDuoError("duo_invalid_request"); }
}
