export type Suit = "clubs" | "diamonds" | "hearts" | "spades";

export type Rank = "7" | "8" | "9" | "J" | "Q" | "K" | "10" | "A";

export type TeamId = 0 | 1;

export type PlayerId = 0 | 1 | 2 | 3;

export type Phase = "bidding" | "playing" | "finished";

export type BidValue = 80 | 90 | 100 | 110 | 120 | 130 | 140 | 150 | 160;

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

export type Bid =
  | {
      playerId: PlayerId;
      action: "pass";
    }
  | {
      playerId: PlayerId;
      action: "bid";
      value: BidValue;
      trump: Suit;
    };

export type Contract = {
  playerId: PlayerId;
  teamId: TeamId;
  value: BidValue;
  trump: Suit;
};

export type RoundResult =
  | {
      kind: "played";
      contract: Contract;
      takerPoints: number;
      defenderPoints: number;
      contractSucceeded: boolean;
      roundScore: Record<TeamId, number>;
    }
  | {
      kind: "all-pass";
      roundScore: Record<TeamId, number>;
    };

export type GameState = {
  phase: Phase;
  trump: Suit | null;
  hands: Record<PlayerId, Card[]>;
  currentPlayerId: PlayerId;
  currentTrick: Trick;
  completedTricks: CompletedTrick[];
  bids: Bid[];
  contract: Contract | null;
  result: RoundResult | null;
  trickPoints: Record<TeamId, number>;
  roundScore: Record<TeamId, number>;
  message: string;
};
