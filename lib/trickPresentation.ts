import { cardId } from "@/engine/cards";
import type { CompletedTrick, PlayedCard, PlayerId } from "@/engine/types";

export const TRICK_PRESENTATION_MS = 1_000;

export type PresentedTrick = {
  key: string;
  trick: CompletedTrick;
};

export type TrickObservation = {
  completedCount: number;
  roundNumber: number;
  scope: string;
};

export type VisualTrickState = {
  cards: PlayedCard[];
  completed: boolean;
  winnerId: PlayerId | null;
};

export function selectVisualTrick(
  currentCards: PlayedCard[],
  presented: PresentedTrick | null,
): VisualTrickState {
  return presented
    ? { cards: presented.trick.cards, completed: true, winnerId: presented.trick.winnerId }
    : { cards: currentCards, completed: false, winnerId: null };
}

export function completedTrickKey(
  roundNumber: number,
  trickIndex: number,
  trick: CompletedTrick,
): string {
  return `${roundNumber}-${trickIndex}-${trick.winnerId}-${trick.cards
    .map((played) => `${played.playerId}-${cardId(played.card)}`)
    .join("_")}`;
}

export function observeCompletedTricks(
  previous: TrickObservation | null,
  input: {
    completedTricks: CompletedTrick[];
    roundNumber: number;
    scope: string;
  },
): {
  additions: PresentedTrick[];
  observation: TrickObservation;
  reset: boolean;
} {
  const observation = {
    completedCount: input.completedTricks.length,
    roundNumber: input.roundNumber,
    scope: input.scope,
  };
  const reset = previous === null
    || previous.scope !== input.scope
    || previous.roundNumber !== input.roundNumber
    || input.completedTricks.length < previous.completedCount;
  if (reset) return { additions: [], observation, reset: true };

  const additions = input.completedTricks
    .slice(previous.completedCount)
    .map((trick, offset) => ({
      key: completedTrickKey(
        input.roundNumber,
        previous.completedCount + offset + 1,
        trick,
      ),
      trick,
    }));
  return { additions, observation, reset: false };
}
