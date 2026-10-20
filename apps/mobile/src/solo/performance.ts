declare const __DEV__: boolean;
// Enum/number-only development diagnostics. Never accept payloads, IDs or URLs.
type Operation = "load" | "start" | "play-card" | "advance-bot" | "pass" | "bid" | "coinche" | "surcoinche" | "capot" | "generale" | "start-next-round";
type Phase = "intent" | "http-start" | "headers" | "body" | "validated" | "state" | "commit" | "frame" | "failure";
export type SoloTrace = { id: number; operation: Operation; started: number } | null;
const development = () => typeof __DEV__ !== "undefined" && __DEV__;
let sequence = 0;
let awaitingDisplay: SoloTrace = null;
export function traceSolo(operation: Operation): SoloTrace {
  if (!development()) return null;
  const trace = { id: ++sequence, operation, started: performance.now() };
  markSolo(trace, "intent"); return trace;
}
export function markSolo(trace: SoloTrace, phase: Phase) {
  if (!development() || !trace) return;
  console.debug("[Solo performance]", { trace: trace.id, operation: trace.operation, phase, elapsedMs: Math.round((performance.now() - trace.started) * 10) / 10 });
  if (phase === "state") awaitingDisplay = trace;
}
export function soloDisplayCommitted() {
  const trace = awaitingDisplay; awaitingDisplay = null;
  if (!trace) return;
  markSolo(trace, "commit"); requestAnimationFrame(() => markSolo(trace, "frame"));
}
export function soloWait(kind: "bot" | "collection", plannedMs: number, elapsedMs: number) {
  if (development()) console.debug("[Solo wait]", { kind, plannedMs, elapsedMs: Math.round(elapsedMs) });
}
export function soloSpeed(speed: "slow" | "normal" | "fast" | "instant" | "custom", botMs: number, biddingMs: number, collectionMs: number, reduced: boolean) {
  if (development()) console.debug("[Solo preferences]", { speed, botMs, biddingMs, collectionMs, reduced });
}
