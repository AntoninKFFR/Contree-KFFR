import { describe, expect, it } from "vitest";
import { inGameSuccessPercent, recordInGameAnswer } from "@/lib/training/inGameSummary";

describe("in-game session summary", () => {
  it("retains fractional recall scores and derives the rate from earned and possible points", () => {
    const first = recordInGameAnswer({}, "trick-recall", { kind: "cards", correct: false,
      earnedScore: 0.5, possibleScore: 1,
      details: { correct: false, score: 0.5, correctIds: [], missedIds: [], extraIds: [], correctPlayers: 0, wrongPlayers: [] } });
    const second = recordInGameAnswer(first, "trick-recall", { kind: "cards", correct: true,
      earnedScore: 1, possibleScore: 1,
      details: { correct: true, score: 1, correctIds: [], missedIds: [], extraIds: [], correctPlayers: 0, wrongPlayers: [] } });
    expect(second["trick-recall"]).toEqual({ questions: 2, earnedScore: 1.5, possibleScore: 2 });
    expect(inGameSuccessPercent(second["trick-recall"]!)).toBe(75);
    expect(second["trick-value"]).toBeUndefined();
  });
});
