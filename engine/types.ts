import type { GameRulesetSnapshot } from "./rulesets/types";

export type Suit = "clubs" | "diamonds" | "hearts" | "spades";

export type Rank = "7" | "8" | "9" | "J" | "Q" | "K" | "10" | "A";

export type TeamId = 0 | 1;

export type GameEndReason = "score" | "forfeit";

export type PlayerId = 0 | 1 | 2 | 3;

export type Phase = "bidding" | "playing" | "finished" | "game-over";

export type BidValue = 80 | 90 | 100 | 110 | 120 | 130 | 140 | 150 | 160;

export type ScoringMode = "ffb" | "announced-points" | "made-points";

export type ContractStatus = "normal" | "coinched" | "surcoinched";

export type GameSettings = {
  scoringMode: ScoringMode;
  targetScore: number;
  /** Absent only on historical states; every newly created game stores a frozen snapshot. */
  ruleset?: GameRulesetSnapshot;
};

export type Card = {
  suit: Suit;
  rank: Rank;
};

export type PlayedCard = {
  playerId: PlayerId;
  card: Card;
};

// Legacy serialization fields retained for reading games created before card announcements were removed.
export type AnnouncementType = "tierce" | "fifty" | "hundred" | "square";

export type CardAnnouncement = {
  playerId: PlayerId;
  teamId: TeamId;
  type: AnnouncementType;
  value: 20 | 50 | 100 | 150 | 200;
  suit?: Suit;
  highestRank?: Rank;
  squareRank?: Rank;
};

export type AnnouncementState = {
  declarations: CardAnnouncement[];
  declaredPlayerIds: PlayerId[];
  winningTeam: TeamId | null;
  pointsByTeam: Record<TeamId, number>;
};

export type BeloteState = {
  declaration: {
    playerId: PlayerId;
    teamId: TeamId;
    firstRank: "K" | "Q";
    completed: boolean;
  } | null;
  pointsByTeam: Record<TeamId, number>;
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
    }
  | {
      playerId: PlayerId;
      action: "capot";
      trump: Suit;
    }
  | {
      playerId: PlayerId;
      action: "coinche";
    }
  | {
      playerId: PlayerId;
      action: "surcoinche";
    };

type ContractBase = {
  playerId: PlayerId;
  teamId: TeamId;
  trump: Suit;
  status: ContractStatus;
  coinchedBy?: PlayerId;
  surcoinchedBy?: PlayerId;
};

export type Contract = ContractBase & (
  | { kind?: "points"; value: BidValue }
  | { kind: "capot"; value: 250 }
);

export type RoundResult =
  | {
      kind: "played";
      contract: Contract;
      takerPoints: number;
      defenderPoints: number;
      trickPointsByTeam: Record<TeamId, number>;
      /** Legacy compatibility field. New round results always contain zeroes. */
      announcementPointsByTeam: Record<TeamId, number>;
      belotePointsByTeam: Record<TeamId, number>;
      totalPointsByTeam: Record<TeamId, number>;
      capotTeam: TeamId | null;
      contractSucceeded: boolean;
      scoringMode: ScoringMode;
      multiplier: number;
      roundScore: Record<TeamId, number>;
    }
  | {
      kind: "all-pass";
      roundScore: Record<TeamId, number>;
    };

export type RoundHistoryEntry = {
  roundNumber: number;
  result: RoundResult;
  totalScoreAfterRound: Record<TeamId, number>;
};

export type GameState = {
  settings: GameSettings;
  playerNames?: Record<PlayerId, string>;
  phase: Phase;
  roundNumber: number;
  startingPlayerId: PlayerId;
  totalScore: Record<TeamId, number>;
  roundHistory: RoundHistoryEntry[];
  winnerTeam: TeamId | null;
  endReason?: GameEndReason | null;
  forfeitingTeam?: TeamId | null;
  trump: Suit | null;
  hands: Record<PlayerId, Card[]>;
  currentPlayerId: PlayerId;
  currentTrick: Trick;
  completedTricks: CompletedTrick[];
  bids: Bid[];
  contract: Contract | null;
  result: RoundResult | null;
  trickPoints: Record<TeamId, number>;
  /** Legacy compatibility field. New game states keep this empty. */
  announcements?: AnnouncementState;
  belote?: BeloteState;
  roundScore: Record<TeamId, number>;
  message: string;
};
