import "server-only";
import {
  BID_READING_AXIS_VERSION, BID_READING_DOCTRINE_ID, BID_READING_DOCTRINE_REVISION,
  BID_READING_SERIES_LENGTH, generateBidReadingSeries, gradeBidReadingExercise,
  type BidReadingAnswer, type BidReadingExercise,
} from "@/engine/training/bidReading";
import { generatorVersion } from "@/engine/training/generator";
import type { TrainingDuoSessionRow } from "./trainingDuoProjection";
import { TrainingDuoError } from "./trainingDuoError";

export function assertSupportedDuoVersions(session: TrainingDuoSessionRow): void {
  if (session.axis_id !== "bid-reading" || session.axis_version !== BID_READING_AXIS_VERSION
    || session.doctrine_id !== BID_READING_DOCTRINE_ID
    || session.doctrine_revision !== BID_READING_DOCTRINE_REVISION
    || session.generator_version !== generatorVersion
    || session.ruleset_id !== "contree-kffr" || session.ruleset_version !== 1
    || session.series_length !== BID_READING_SERIES_LENGTH) {
    throw new TrainingDuoError("duo_version_unsupported");
  }
}

export function duoSeries(session: TrainingDuoSessionRow, seed: number): BidReadingExercise[] {
  assertSupportedDuoVersions(session);
  return generateBidReadingSeries({
    seed, level: session.level, generatorVersion: session.generator_version,
    axisVersion: session.axis_version,
  });
}

export function gradeDuoAnswer(exercise: BidReadingExercise, supplied: BidReadingAnswer): {
  answer: BidReadingAnswer; score: 0 | 1;
} {
  const selected = supplied.selectedAssertionIds;
  if (selected.length > exercise.assertionChoices.length
    || new Set(selected).size !== selected.length
    || selected.some((id) => !exercise.assertionChoices.includes(id))) {
    throw new TrainingDuoError("duo_invalid_answer");
  }
  const answer = { selectedAssertionIds: [...selected].sort() } as BidReadingAnswer;
  return { answer, score: gradeBidReadingExercise(exercise, answer).score };
}
