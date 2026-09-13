export type RulesetId = "contree-kffr" | `legacy-${string}` | "custom" | (string & {});

export type RulesetScoringMode =
  | "ffb"
  | "contract-only"
  | "contract-only-160-failure"
  | "points-only";

export type GameRulesetSnapshot = {
  readonly id: RulesetId;
  readonly version: number;
  readonly game: {
    readonly targetScore: number;
  };
  readonly bidding: {
    readonly minBid: number;
    readonly maxBid: number;
    readonly bidStep: number;
    readonly allowCapot: boolean;
    readonly allowGenerale: boolean;
    /** Générale special modes are opt-in, independently from ordinary SA/TA contracts. */
    readonly generaleAllowNoTrump: boolean;
    readonly generaleAllowAllTrump: boolean;
    readonly allowCoinche: boolean;
    readonly allowSurcoinche: boolean;
    readonly allowNoTrump: boolean;
    readonly allowAllTrump: boolean;
  };
  readonly cardPlay: {
    readonly mustFollowSuit: boolean;
    readonly mustTrumpWhenVoid: boolean;
    readonly mustOvertrump: boolean;
    readonly mustRaiseAtTrump: boolean;
    readonly allowDiscardWhenPartnerWinning: boolean;
    readonly allowDiscardWhenCannotOvertrump: boolean;
  };
  readonly announcements: {
    readonly enabled: boolean;
    readonly tierce: boolean;
    readonly fifty: boolean;
    readonly hundred: boolean;
    readonly squares: boolean;
  };
  readonly belote: {
    readonly enabled: boolean;
    readonly points: number;
    readonly countsForContractSuccess: boolean;
    readonly countsForContractFailure: boolean;
    readonly allowInAllTrump: boolean;
  };
  readonly contractSuccess: {
    readonly mustReachBid: boolean;
    readonly mustBeatDefense: boolean;
    readonly announcementsCount: boolean;
  };
  readonly trickScoring: {
    readonly lastTrickBonus: number;
    readonly capotLastTrickBonus: number;
  };
  readonly scoring: {
    readonly mode: RulesetScoringMode;
    readonly roundToTen: boolean;
    /** Transfer the failed taker's announcement points to the defense. */
    readonly announcementsLostOnFailure: boolean;
    /** Transfer the non-capot team's announcement points to the capot team. */
    readonly announcementsLostOnCapot: boolean;
    readonly failureBasePoints: number;
    readonly capotBasePoints: number;
    readonly generaleBasePoints: number;
    readonly coincheMultiplier: number;
    readonly surcoincheMultiplier: number;
    /** Multiply both teams' complete round scores instead of the mode-specific contract formula. */
    readonly doubleAllPointsOnCoinche: boolean;
  };
};
