import { cardId } from "@/engine/cards";
import type { CompletedTrick, GameState, PlayedCard, PlayerId } from "@/engine/types";

export type PresentedTrick = {
  key: string;
  trickIndex: number;
  trick: CompletedTrick;
};

export type CardPresentation = {
  trickKey: string;
  seenKeys: string[];
  animatedKeys: string[];
  newKeys: string[];
};

export type TrickLayer = {
  key: string;
  kind: "completed" | "queued" | "current";
  cards: PlayedCard[];
  optimisticKey: string | null;
};

export function playedCardKey(played: PlayedCard): string {
  return `${played.playerId}-${cardId(played.card)}`;
}

/** A completed trick and the following live trick retain separate, stable React keys. */
export function selectTrickLayers(input: {
  scope: string;
  roundNumber: number;
  completedCount: number;
  currentCards: PlayedCard[];
  presented: PresentedTrick | null;
  followingCompletedTricks?: CompletedTrick[];
  optimisticCard?: PlayedCard | null;
}): TrickLayer[] {
  const completedCards = input.presented?.trick.cards ?? [];
  const optimisticKey = input.optimisticCard ? playedCardKey(input.optimisticCard) : null;
  const alreadyCompleted = optimisticKey !== null && [input.presented?.trick, ...(input.followingCompletedTricks ?? [])]
    .some((trick) => trick?.cards.some((played) => playedCardKey(played) === optimisticKey));
  const currentCards = optimisticKey
    && !alreadyCompleted
    && !input.currentCards.some((played) => playedCardKey(played) === optimisticKey)
    ? [...input.currentCards, input.optimisticCard!]
    : input.currentCards;
  const current: TrickLayer = {
    key: `${input.scope}-${input.roundNumber}-${input.completedCount + 1}`,
    kind: "current",
    cards: currentCards,
    optimisticKey: optimisticKey && currentCards.some((played) => playedCardKey(played) === optimisticKey) ? optimisticKey : null,
  };
  return input.presented ? [
    {
      key: `${input.scope}-${input.roundNumber}-${input.presented.trickIndex}`,
      kind: "completed", cards: completedCards, optimisticKey: null,
    },
    ...(input.followingCompletedTricks ?? []).map((trick, index): TrickLayer => ({
      key: `${input.scope}-${input.roundNumber}-${input.presented!.trickIndex + index + 1}`,
      kind: "queued", cards: trick.cards, optimisticKey: null,
    })),
    current,
  ] : [current];
}

export function planTrickLayerPresentations(
  previous: ReadonlyMap<string, CardPresentation>,
  layers: readonly TrickLayer[],
  animationEnabled: boolean,
): Map<string, CardPresentation> {
  return new Map(layers.map((layer) => [layer.key, planCardPresentation(
    previous.get(layer.key) ?? null, layer.key, layer.cards, animationEnabled, layer.optimisticKey,
  )]));
}

/** Keep the animation decision attached to a card for the entire visual trick. */
export function planCardPresentation(
  previous: CardPresentation | null,
  trickKey: string,
  cards: readonly PlayedCard[],
  animationEnabled: boolean,
  optimisticKey: string | null = null,
): CardPresentation {
  const seenKeys = cards.map(playedCardKey);
  const previousSeen = previous?.trickKey === trickKey ? new Set(previous.seenKeys) : null;
  const newKeys = previousSeen ? seenKeys.filter((key) => !previousSeen.has(key)) : previous ? seenKeys : optimisticKey ? seenKeys.filter((key) => key === optimisticKey) : [];
  const animatedKeys = animationEnabled
    ? [...new Set([...(previous?.trickKey === trickKey ? previous.animatedKeys : []), ...newKeys])]
    : [];
  return { trickKey, seenKeys, animatedKeys, newKeys };
}

export function currentTrickLeaderId(state: Pick<GameState, "phase" | "currentTrick" | "currentPlayerId" | "startingPlayerId">): PlayerId {
  if (state.phase === "playing") return state.currentTrick.cards[0]?.playerId ?? state.currentPlayerId;
  return state.startingPlayerId;
}

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
      trickIndex: previous.completedCount + offset + 1,
      trick,
    }));
  return { additions, observation, reset: false };
}
