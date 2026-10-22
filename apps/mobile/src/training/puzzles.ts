import { generateTrickValueSeries, type TrickValueExercise } from "@/engine/training/trickValue";
import { generateMemorySeries, gradeMemoryExercise, isMemoryAxisId, type MemoryExercise } from "@/engine/training/memory";
import { generateOpponentVoidsSeries, gradeOpponentVoidsExercise, type OpponentVoidsExercise } from "@/engine/training/opponentVoids";
import { BIDDING_AXIS_VERSION, generateBiddingSeries, gradeBiddingExercise, type BiddingAnswer, type BiddingExercise, type BiddingLevel } from "@/engine/training/bidding";
import { BID_READING_AXIS_VERSION, generateBidReadingSeries, gradeBidReadingExercise, type BidReadingAnswer, type BidReadingExercise, type BidReadingLevel } from "@/engine/training/bidReading";
import { generatorVersion } from "@/engine/training/generator";
import { biddingSeriesSeed, bidReadingSeriesSeed, memorySeriesSeed, opponentVoidsSeriesSeed, trickValueSeriesSeed, recordBiddingSeries, recordBidReadingSeries, recordMemorySeries, recordOpponentVoidsSeries, recordTrickValueSeries, type TrainingProgress } from "@/lib/training/progress";
import type { SubmittedTrainingAnswer } from "@/engine/training/seriesContract";
import { levelCount, type PuzzleAxis } from "./catalogue";
export type NativePuzzle = { kind: "number"; data: TrickValueExercise } | { kind: "cards"; data: MemoryExercise } | { kind: "voids"; data: OpponentVoidsExercise } | { kind: "bidding"; data: BiddingExercise } | { kind: "reading"; data: BidReadingExercise };
export type PuzzleAnswer = SubmittedTrainingAnswer | { kind: "bidding"; value: BiddingAnswer } | { kind: "reading"; value: BidReadingAnswer };
export function preparePuzzles(axis: PuzzleAxis, level: number, progress: TrainingProgress): { seed: number; series: NativePuzzle[] } {
  if (!Number.isInteger(level) || level < 1 || level > levelCount(axis) || level > progress.axes[axis].unlockedLevel) throw Error("Niveau verrouillé. Obtiens 8/10 au niveau précédent.");
  if (axis === "trick-value") { const seed = trickValueSeriesSeed(progress, level as 1 | 2); return { seed, series: generateTrickValueSeries({ seed, level: level as 1 | 2, generatorVersion }).map((data) => ({ kind: "number", data })) }; }
  if (isMemoryAxisId(axis)) { const seed = memorySeriesSeed(progress, axis, level); return { seed, series: generateMemorySeries({ seed, axisId: axis, level, generatorVersion }).map((data) => ({ kind: "cards", data })) }; }
  if (axis === "opponent-voids") { const seed = opponentVoidsSeriesSeed(progress, level); return { seed, series: generateOpponentVoidsSeries({ seed, level, generatorVersion }).map((data) => ({ kind: "voids", data })) }; }
  if (axis === "bidding") { const seed = biddingSeriesSeed(progress, level as BiddingLevel); return { seed, series: generateBiddingSeries({ seed, level: level as BiddingLevel, generatorVersion, axisVersion: BIDDING_AXIS_VERSION }).map((data) => ({ kind: "bidding", data })) }; }
  const seed = bidReadingSeriesSeed(progress, level as BidReadingLevel); return { seed, series: generateBidReadingSeries({ seed, level: level as BidReadingLevel, generatorVersion, axisVersion: BID_READING_AXIS_VERSION }).map((data) => ({ kind: "reading", data })) };
}
export function gradePuzzle(puzzle: NativePuzzle, answer: PuzzleAnswer): number {
  if (puzzle.kind === "number" && answer.kind === "number") return Number(answer.value === puzzle.data.answer);
  if (puzzle.kind === "cards" && answer.kind === "cards") return gradeMemoryExercise(puzzle.data, answer.selectedIds, answer.assignments).score;
  if (puzzle.kind === "voids" && answer.kind === "voids") return gradeOpponentVoidsExercise(puzzle.data, answer.selectedCells, answer.trumpCount).score;
  if (puzzle.kind === "bidding" && answer.kind === "bidding") return gradeBiddingExercise(puzzle.data, answer.value).score;
  if (puzzle.kind === "reading" && answer.kind === "reading") return gradeBidReadingExercise(puzzle.data, answer.value).score;
  throw Error("Type de réponse invalide.");
}
export function recordPuzzle(progress: TrainingProgress, axis: PuzzleAxis, level: number, score: number) {
  if (axis === "trick-value") return recordTrickValueSeries(progress, level as 1 | 2, score);
  if (isMemoryAxisId(axis)) return recordMemorySeries(progress, axis, level, score);
  if (axis === "opponent-voids") return recordOpponentVoidsSeries(progress, level, score);
  if (axis === "bidding") return recordBiddingSeries(progress, level as BiddingLevel, score);
  return recordBidReadingSeries(progress, level as BidReadingLevel, score);
}
/** Synchronous gates prevent two taps/timeouts from validating or advancing twice. */
export class PuzzleRun {
  readonly seed: number; readonly series: NativePuzzle[]; readonly startedAt: number;
  index = 0; score = 0; grade: number | null = null; finished = false; endedAt = 0;
  readonly answers: PuzzleAnswer[] = [];
  constructor(readonly axis: PuzzleAxis, readonly level: number, progress: TrainingProgress, private now = () => performance.now()) {
    const prepared = preparePuzzles(axis, level, progress); this.seed = prepared.seed; this.series = prepared.series; this.startedAt = now();
  }
  get puzzle() { return this.series[this.index]; }
  get receipt() { return `${this.axis}:${this.level}:${this.seed}`; }
  submit(answer: PuzzleAnswer) {
    if (this.finished || this.grade !== null) return false;
    const grade = gradePuzzle(this.puzzle, answer);
    this.answers.push(answer); this.grade = grade;
    if (this.index === this.series.length - 1) this.endedAt = this.now();
    return true;
  }
  next() {
    if (this.finished || this.grade === null) return false;
    this.score += this.grade;
    if (this.index === this.series.length - 1) this.finished = true;
    else { this.index += 1; this.grade = null; }
    return true;
  }
}
