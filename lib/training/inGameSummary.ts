import type { InGameAxisId, InGameGrade } from "@/engine/training/inGame";

export type AxisSummary = { questions: number; earnedScore: number; possibleScore: number };
export type InGameSummary = Partial<Record<InGameAxisId, AxisSummary>>;

export function recordInGameAnswer(summary: InGameSummary, axisId: InGameAxisId, grade: InGameGrade): InGameSummary {
  const current = summary[axisId] ?? { questions: 0, earnedScore: 0, possibleScore: 0 };
  return { ...summary, [axisId]: {
    questions: current.questions + 1,
    earnedScore: current.earnedScore + grade.earnedScore,
    possibleScore: current.possibleScore + grade.possibleScore,
  } };
}

export function inGameSuccessPercent({ earnedScore, possibleScore }: AxisSummary): number {
  return possibleScore > 0 ? Math.round(100 * earnedScore / possibleScore) : 0;
}
