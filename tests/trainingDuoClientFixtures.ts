import { BID_READING_AXIS_VERSION, generateBidReadingSeries } from "@/engine/training/bidReading";
import { generatorVersion } from "@/engine/training/generator";
import type { TrainingDuoView } from "@/lib/trainingDuoTypes";

const exercise = generateBidReadingSeries({ seed: 480_000, level: 1, generatorVersion, axisVersion: BID_READING_AXIS_VERSION })[0];
export function duoFixture(status: TrainingDuoView["session"]["status"] = "lobby", viewerSlot: 0 | 1 = 0): TrainingDuoView {
  return {
    session: { id: "duo-id", code: status === "lobby" ? "ABCDEFGHJK" : undefined, status,
      questionPhase: status === "active" ? "answering" : null, level: 1, axisId: "bid-reading", axisVersion: 1,
      doctrineId: "advanced_rules_v4", doctrineRevision: "4.1", generatorVersion: 1,
      rulesetId: "contree-kffr", rulesetVersion: 1, seriesLength: 10, currentIndex: 0, stateVersion: 1,
      createdAt: "2026-09-27T00:00:00Z", startedAt: null, finishedAt: null, cancelReason: null },
    participants: [
      { slot: 0, displayName: "Alice", isHost: true, isReady: false, isConnected: true, hasAnswered: false, readyForNext: false },
      { slot: 1, displayName: "Bob", isHost: false, isReady: false, isConnected: true, hasAnswered: false, readyForNext: false },
    ], viewerSlot,
    exercise: status === "active" ? {
      kind: "public", questionIndex: 0, level: 1, publicBids: exercise.publicBids,
      targetBidIndex: exercise.targetBidIndex, targetPlayerId: exercise.targetPlayerId,
      targetBid: exercise.targetBid, playerNames: exercise.playerNames,
      assertionChoices: exercise.assertionChoices,
    } : null,
    result: status === "completed" ? { scoreA: 8, scoreB: 6, commonSuccesses: 5, outOf: 10 } : undefined,
  };
}
export function revealedFixture(viewerSlot: 0 | 1 = 0): TrainingDuoView {
  const view = duoFixture("active", viewerSlot);
  view.session.questionPhase = "revealed";
  view.exercise = { ...view.exercise!, kind: "revealed", promise: exercise.promise,
    illustrationHand: exercise.illustrationHand,
    answers: [
      { slot: 0, answer: { selectedAssertionIds: [] }, correct: false, score: 0 },
      { slot: 1, answer: { selectedAssertionIds: exercise.promise.guaranteed }, correct: true, score: 1 },
    ] };
  return view;
}
