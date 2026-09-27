import "server-only";
import type { BidReadingAnswer, BidReadingExercise, BidReadingLevel } from "@/engine/training/bidReading";
import { PRESENCE_OFFLINE_TIMEOUT_MS } from "@/lib/multiplayerPresence";
import type { TrainingDuoQuestionPhase, TrainingDuoStatus, TrainingDuoView } from "@/lib/trainingDuoTypes";
import { TrainingDuoError } from "./trainingDuoError";

export type TrainingDuoSessionRow = {
  id: string; code: string; host_user_id: string; status: TrainingDuoStatus;
  question_phase: TrainingDuoQuestionPhase | null; level: BidReadingLevel;
  axis_id: string; axis_version: number; doctrine_id: string; doctrine_revision: string;
  generator_version: number; ruleset_id: string; ruleset_version: number; series_length: number;
  current_index: number; state_version: number; created_at: string; updated_at: string;
  started_at: string | null; finished_at: string | null; cancel_reason: string | null;
};
export type TrainingDuoParticipantRow = {
  id: string; session_id: string; user_id: string; slot: 0 | 1; display_name: string;
  is_ready: boolean; last_seen_at: string | null; ready_for_next: boolean;
  joined_at: string; left_at: string | null;
};
export type TrainingDuoAnswerRow = {
  session_id: string; question_index: number; user_id: string;
  answer: BidReadingAnswer; score: 0 | 1; submitted_at: string;
};

export function toTrainingDuoView(input: {
  session: TrainingDuoSessionRow;
  participants: TrainingDuoParticipantRow[];
  answers: TrainingDuoAnswerRow[];
  exercise: BidReadingExercise | null;
  viewerUserId: string;
  nowMs?: number;
}): TrainingDuoView {
  const { session, answers, exercise, viewerUserId } = input;
  const participants = input.participants.filter((participant) => participant.left_at === null)
    .sort((a, b) => a.slot - b.slot);
  const viewer = participants.find((participant) => participant.user_id === viewerUserId);
  if (!viewer) throw new TrainingDuoError("duo_session_not_found");
  const nowMs = input.nowMs ?? Date.now();
  const currentAnswers = answers.filter((answer) => answer.question_index === session.current_index);
  const revealed = session.status === "completed"
    || (session.status === "active" && session.question_phase === "revealed");
  const view: TrainingDuoView = {
    session: {
      id: session.id,
      ...(session.status === "lobby" ? { code: session.code } : {}),
      status: session.status, questionPhase: session.question_phase,
      level: session.level, axisId: "bid-reading", axisVersion: 1,
      doctrineId: "advanced_rules_v4", doctrineRevision: "4.1", generatorVersion: 1,
      rulesetId: "contree-kffr", rulesetVersion: 1, seriesLength: 10,
      currentIndex: session.current_index, stateVersion: session.state_version,
      createdAt: session.created_at, startedAt: session.started_at,
      finishedAt: session.finished_at, cancelReason: session.cancel_reason,
    },
    participants: participants.map((participant) => {
      const seen = participant.last_seen_at ? Date.parse(participant.last_seen_at) : NaN;
      return {
        slot: participant.slot, displayName: participant.display_name,
        isHost: participant.user_id === session.host_user_id,
        isReady: participant.is_ready,
        isConnected: Number.isFinite(seen) && seen >= nowMs - PRESENCE_OFFLINE_TIMEOUT_MS,
        hasAnswered: currentAnswers.some((answer) => answer.user_id === participant.user_id),
        readyForNext: participant.ready_for_next,
      };
    }),
    viewerSlot: viewer.slot,
    exercise: null,
  };
  if (exercise && (session.status === "active" || session.status === "completed")) {
    const common = {
      questionIndex: session.current_index, level: session.level,
      publicBids: exercise.publicBids, targetBidIndex: exercise.targetBidIndex,
      targetPlayerId: exercise.targetPlayerId, targetBid: exercise.targetBid,
      playerNames: exercise.playerNames, assertionChoices: exercise.assertionChoices,
    };
    if (revealed) {
      if (currentAnswers.length !== 2) throw new Error("Revealed duo question lacks two committed answers.");
      view.exercise = {
        kind: "revealed", ...common, promise: exercise.promise,
        illustrationHand: exercise.illustrationHand,
        answers: participants.map((participant) => {
          const answer = currentAnswers.find((candidate) => candidate.user_id === participant.user_id);
          if (!answer) throw new Error("Revealed duo participant lacks an answer.");
          return { slot: participant.slot, answer: answer.answer, correct: answer.score === 1, score: answer.score };
        }),
      };
    } else {
      view.exercise = { kind: "public", ...common };
    }
  }
  if (session.status === "completed") {
    const scoreFor = (userId: string) => answers.filter((answer) => answer.user_id === userId)
      .reduce((sum, answer) => sum + answer.score, 0);
    const scoreA = scoreFor(participants[0].user_id);
    const scoreB = scoreFor(participants[1].user_id);
    const commonSuccesses = Array.from({ length: 10 }, (_, index) => index)
      .filter((index) => participants.every((participant) => answers.some((answer) =>
        answer.question_index === index && answer.user_id === participant.user_id && answer.score === 1))).length;
    view.result = { scoreA, scoreB, commonSuccesses, outOf: 10 };
  }
  return view;
}
