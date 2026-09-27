import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { BID_READING_AXIS_VERSION, generateBidReadingSeries } from "@/engine/training/bidReading";
import { generatorVersion } from "@/engine/training/generator";
import {
  toTrainingDuoView, type TrainingDuoAnswerRow, type TrainingDuoParticipantRow,
  type TrainingDuoSessionRow,
} from "@/lib/server/trainingDuoProjection";

const NOW = Date.parse("2026-09-27T12:00:00.000Z");
const EXERCISE = generateBidReadingSeries({
  seed: 480_000, level: 1, generatorVersion, axisVersion: BID_READING_AXIS_VERSION,
})[0];
const SESSION: TrainingDuoSessionRow = {
  id: "session", code: "ABCDEFGHJK", host_user_id: "host", status: "lobby", question_phase: null,
  level: 1, axis_id: "bid-reading", axis_version: 1,
  doctrine_id: "advanced_rules_v4", doctrine_revision: "4.1", generator_version: 1,
  ruleset_id: "contree-kffr", ruleset_version: 1, series_length: 10,
  current_index: 0, state_version: 0, created_at: new Date(NOW).toISOString(),
  updated_at: new Date(NOW).toISOString(), started_at: null, finished_at: null, cancel_reason: null,
};
const PARTICIPANTS: TrainingDuoParticipantRow[] = [
  { id: "row-host", session_id: "session", user_id: "host", slot: 0, display_name: "A",
    is_ready: true, last_seen_at: new Date(NOW).toISOString(), ready_for_next: false,
    joined_at: new Date(NOW).toISOString(), left_at: null },
  { id: "row-partner", session_id: "session", user_id: "partner", slot: 1, display_name: "B",
    is_ready: true, last_seen_at: new Date(NOW - 61_000).toISOString(), ready_for_next: false,
    joined_at: new Date(NOW).toISOString(), left_at: null },
];
const ANSWER: TrainingDuoAnswerRow = {
  session_id: "session", question_index: 0, user_id: "host",
  answer: { selectedAssertionIds: [] }, score: 0, submitted_at: new Date(NOW).toISOString(),
};

function view(status: TrainingDuoSessionRow["status"], phase: TrainingDuoSessionRow["question_phase"],
  answers: TrainingDuoAnswerRow[] = [], viewerUserId = "host") {
  return toTrainingDuoView({
    session: { ...SESSION, status, question_phase: phase, started_at: status === "lobby" ? null : new Date(NOW).toISOString() },
    participants: PARTICIPANTS, answers,
    exercise: status === "lobby" || status === "cancelled" ? null : EXERCISE,
    viewerUserId, nowMs: NOW,
  });
}

describe("training duo privacy projection", () => {
  it("shows a lobby code, host, ready state and derived presence without user UUIDs", () => {
    const lobby = view("lobby", null);
    expect(lobby.session.code).toBe("ABCDEFGHJK");
    expect(lobby.participants.map((p) => p.isConnected)).toEqual([true, false]);
    expect(lobby.participants.map((p) => p.isHost)).toEqual([true, false]);
    expect(lobby.exercise).toBeNull();
    expect(JSON.stringify(lobby)).not.toContain("host_user_id");
    expect(JSON.stringify(lobby)).not.toContain("user_id");
  });

  it("omits every answer and correction field before the second commit, even for the submitter", () => {
    for (const answers of [[], [ANSWER]]) {
      for (const viewerUserId of ["host", "partner"]) {
        const pending = view("active", "answering", answers, viewerUserId);
        expect(pending.exercise?.kind).toBe("public");
        expect(pending.participants[0].hasAnswered).toBe(answers.length === 1);
        const raw = JSON.stringify(pending);
        for (const secret of ["seed", "promise", "guaranteed", "possibleMeanings", "explanation",
          "illustrationHand", "score", "correct", "selectedAssertionIds", "host_user_id", "user_id"]) {
          expect(raw).not.toContain(`"${secret}"`);
        }
      }
    }
  });

  it("reveals both immutable answers and grades after both commits", () => {
    const two = [ANSWER, { ...ANSWER, user_id: "partner", score: 1 as const }];
    const revealed = view("active", "revealed", two);
    expect(revealed.exercise?.kind).toBe("revealed");
    if (revealed.exercise?.kind !== "revealed") throw new Error("missing reveal");
    expect(revealed.exercise.promise.guaranteed).toEqual(EXERCISE.promise.guaranteed);
    expect(revealed.exercise.illustrationHand).toEqual(EXERCISE.illustrationHand);
    expect(revealed.exercise.answers.map((answer) => answer.score)).toEqual([0, 1]);
  });

  it("shows the completed recap and keeps a cancelled pending question private", () => {
    const answers = Array.from({ length: 10 }, (_, question_index) => [
      { ...ANSWER, question_index, score: 1 as const },
      { ...ANSWER, question_index, user_id: "partner", score: (question_index < 7 ? 1 : 0) as 0 | 1 },
    ]).flat();
    const completed = view("completed", null, answers);
    expect(completed.result).toEqual({ scoreA: 10, scoreB: 7, commonSuccesses: 7, outOf: 10 });
    expect(completed.exercise?.kind).toBe("revealed");
    const cancelled = view("cancelled", null, [ANSWER]);
    expect(cancelled.exercise).toBeNull();
    expect(cancelled.result).toBeUndefined();
  });

  it("rejects a non-member and incomplete revealed state", () => {
    expect(() => view("lobby", null, [], "intruder")).toThrow();
    expect(() => view("active", "revealed", [ANSWER])).toThrow();
  });
});
