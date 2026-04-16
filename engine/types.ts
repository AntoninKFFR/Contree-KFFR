export type Suit = "clubs" | "diamonds" | "hearts" | "spades";

export type Rank = "7" | "8" | "9" | "J" | "Q" | "K" | "10" | "A";

export type TeamId = 0 | 1;

export type PlayerId = 0 | 1 | 2 | 3;

export type Phase = "playing" | "finished";

export type Card = {
  suit: Suit;
  rank: Rank;
};

export type PlayedCard = {
  playerId: PlayerId;
  card: Card;
};

export type Trick = {
  leaderId: PlayerId;
  cards: PlayedCard[];
};

export type CompletedTrick = Trick & {
  winnerId: PlayerId;
  points: number;
};

export type GameState = {
  phase: Phase;
  trump: Suit;
  hands: Record<PlayerId, Card[]>;
  currentPlayerId: PlayerId;
  currentTrick: Trick;
  completedTricks: CompletedTrick[];
  trickPoints: Record<TeamId, number>;
  roundScore: Record<TeamId, number>;
  message: string;
};
