import { describe, expect, it } from "vitest";
import { detectAnnouncements, compareAnnouncements } from "@/engine/announcements";
import { playBeloteCard } from "@/engine/belote";
import { createInitialGame, makeBid, playCard, playableCardsForCurrentPlayer } from "@/engine/game";
import { cardPoints, compareCards, getLegalCards, getRoundCardPointTotal, getTrickWinner, trickPoints } from "@/engine/rules";
import { CONTREE_KFFR_RULESET } from "@/engine/rulesets/presets";
import { validateRuleset } from "@/engine/rulesets/validation";
import { scoreRound } from "@/engine/scoring";
import type { Card, ContractMode, GameState, PlayedCard } from "@/engine/types";
import { chooseMonteCarloCardToPlay } from "@/bots/strategy/monteCarloCardStrategy";
import { captureBotReviewScenario } from "@/bots/botReview";

const nt: ContractMode = { kind: "no-trump" };
const at: ContractMode = { kind: "all-trump" };
const suit: ContractMode = { kind: "suit", suit: "hearts" };
const cards = (...values: Array<[Card["rank"], Card["suit"]]>): Card[] => values.map(([rank, cardSuit]) => ({ rank, suit: cardSuit }));
const played = (values: Card[]): PlayedCard[] => values.map((card, playerId) => ({ card, playerId: playerId as 0 | 1 | 2 | 3 }));
const rules = (allowNoTrump: boolean, allowAllTrump: boolean) => ({
  ...structuredClone(CONTREE_KFFR_RULESET),
  id: `test-${allowNoTrump}-${allowAllTrump}`,
  bidding: { ...CONTREE_KFFR_RULESET.bidding, allowNoTrump, allowAllTrump },
});

function biddingState(mode: ContractMode, enabled = true): GameState {
  let state = createInitialGame(() => 0.01, { ruleset: rules(enabled && mode.kind === "no-trump", enabled && mode.kind === "all-trump") });
  state = makeBid(state, state.currentPlayerId, { action: "bid", value: 80, contractMode: mode });
  for (let index = 0; index < 3; index += 1) state = makeBid(state, state.currentPlayerId, { action: "pass" });
  return state;
}

describe("contract modes", () => {
  it("keeps legacy suit card points unchanged", () => expect(cardPoints({ rank: "J", suit: "hearts" }, "hearts")).toBe(20));
  it("normalizes legacy suit semantics", () => expect(cardPoints({ rank: "9", suit: "clubs" }, "hearts")).toBe(0));
  it("allows no-trump when enabled", () => expect(biddingState(nt).contractMode).toEqual(nt));
  it("rejects no-trump when disabled", () => expect(() => biddingState(nt, false)).toThrow(/not allowed/i));
  it("allows all-trump when enabled", () => expect(biddingState(at).contractMode).toEqual(at));
  it("rejects all-trump when disabled", () => expect(() => biddingState(at, false)).toThrow(/not allowed/i));
  it("uses normal no-trump ordering", () => expect(compareCards({ rank: "A", suit: "clubs" }, { rank: "J", suit: "clubs" }, "clubs", nt)).toBeGreaterThan(0));
  it("uses normal no-trump points", () => expect(cardPoints({ rank: "J", suit: "clubs" }, nt)).toBe(2));
  it("uses trump all-trump ordering", () => expect(compareCards({ rank: "J", suit: "clubs" }, { rank: "A", suit: "clubs" }, "clubs", at)).toBeGreaterThan(0));
  it("uses trump all-trump points", () => expect(cardPoints({ rank: "9", suit: "clubs" }, at)).toBe(14));
  it("requires following suit in no-trump", () => expect(getLegalCards(cards(["7", "clubs"], ["A", "hearts"]), { leaderId: 0, cards: played(cards(["A", "clubs"])) }, 1, nt).map((c) => c.suit)).toEqual(["clubs"]));
  it("allows a free discard when void in no-trump", () => expect(getLegalCards(cards(["7", "diamonds"], ["A", "hearts"]), { leaderId: 0, cards: played(cards(["A", "clubs"])) }, 1, nt)).toHaveLength(2));
  it("requires following suit in all-trump", () => expect(getLegalCards(cards(["7", "clubs"], ["J", "hearts"]), { leaderId: 0, cards: played(cards(["9", "clubs"])) }, 1, at).map((c) => c.suit)).toEqual(["clubs"]));
  it("requires raising in the led all-trump suit", () => expect(getLegalCards(cards(["7", "clubs"], ["J", "clubs"]), { leaderId: 0, cards: played(cards(["9", "clubs"])) }, 1, at)).toEqual(cards(["J", "clubs"])));
  it("allows a free discard when void in all-trump", () => expect(getLegalCards(cards(["J", "diamonds"], ["A", "hearts"]), { leaderId: 0, cards: played(cards(["9", "clubs"])) }, 1, at)).toHaveLength(2));
  it("chooses a no-trump trick winner", () => expect(getTrickWinner({ leaderId: 0, cards: played(cards(["10", "clubs"], ["A", "clubs"], ["J", "hearts"], ["K", "clubs"])) }, nt)).toBe(1));
  it("chooses an all-trump trick winner", () => expect(getTrickWinner({ leaderId: 0, cards: played(cards(["A", "clubs"], ["9", "clubs"], ["J", "hearts"], ["10", "clubs"])) }, at)).toBe(1));
  it("scores no-trump trick points", () => expect(trickPoints(played(cards(["A", "clubs"], ["10", "clubs"])), nt, false)).toBe(21));
  it("scores all-trump trick points", () => expect(trickPoints(played(cards(["J", "clubs"], ["9", "clubs"])), at, false)).toBe(34));
  it("adds the no-trump last trick bonus", () => expect(trickPoints(played(cards(["A", "clubs"])), nt, true)).toBe(21));
  it("adds the all-trump last trick bonus", () => expect(trickPoints(played(cards(["J", "clubs"])), at, true)).toBe(30));
  it("derives all three round totals", () => expect([getRoundCardPointTotal(suit), getRoundCardPointTotal(nt), getRoundCardPointTotal(at)]).toEqual([162, 130, 258]));
  it("derives special capot totals with the configured capot bonus", () => expect([getRoundCardPointTotal(nt, CONTREE_KFFR_RULESET.trickScoring, true), getRoundCardPointTotal(at, CONTREE_KFFR_RULESET.trickScoring, true)]).toEqual([220, 348]));
  it("recognizes a no-trump capot from eight tricks", () => expect(scoreRound({ contract: { kind: "capot", value: 250, playerId: 0, teamId: 0, contractMode: nt, status: "normal" }, settings: { scoringMode: "ffb", targetScore: 1000, ruleset: rules(true, false) }, trickPointsByTeam: { 0: 220, 1: 0 }, tricksWonByTeam: { 0: 8, 1: 0 } }).capotTeam).toBe(0));
  it("recognizes an all-trump capot from eight tricks", () => expect(scoreRound({ contract: { kind: "capot", value: 250, playerId: 0, teamId: 0, contractMode: at, status: "normal" }, settings: { scoringMode: "ffb", targetScore: 1000, ruleset: rules(false, true) }, trickPointsByTeam: { 0: 348, 1: 0 }, tricksWonByTeam: { 0: 8, 1: 0 } }).contractSucceeded).toBe(true));
  it("keeps suit Belote", () => expect(playBeloteCard(undefined, cards(["K", "hearts"], ["Q", "hearts"]), 0, { rank: "K", suit: "hearts" }, suit).declaration).not.toBeNull());
  it("disables Belote in no-trump", () => expect(playBeloteCard(undefined, cards(["K", "hearts"], ["Q", "hearts"]), 0, { rank: "K", suit: "hearts" }, nt).declaration).toBeNull());
  it("disables all-trump Belote by rule", () => expect(playBeloteCard(undefined, cards(["K", "hearts"], ["Q", "hearts"]), 0, { rank: "K", suit: "hearts" }, at, 20, false).declaration).toBeNull());
  it("supports multiple all-trump Belote colors", () => {
    let state = playBeloteCard(undefined, cards(["K", "hearts"], ["Q", "hearts"], ["K", "clubs"], ["Q", "clubs"]), 0, { rank: "K", suit: "hearts" }, at, 20, true);
    state = playBeloteCard(state, cards(["Q", "hearts"], ["K", "clubs"], ["Q", "clubs"]), 0, { rank: "Q", suit: "hearts" }, at, 20, true);
    state = playBeloteCard(state, cards(["K", "clubs"], ["Q", "clubs"]), 0, { rank: "K", suit: "clubs" }, at, 20, true);
    state = playBeloteCard(state, cards(["Q", "clubs"]), 0, { rank: "Q", suit: "clubs" }, at, 20, true);
    expect(state.pointsByTeam[0]).toBe(40);
  });
  it("detects announcements in no-trump", () => expect(detectAnnouncements(cards(["7", "clubs"], ["8", "clubs"], ["9", "clubs"]), 0, nt, { ...CONTREE_KFFR_RULESET.announcements, enabled: true, tierce: true })).toHaveLength(1));
  it("gives no trump-suit tie advantage in all-trump", () => expect(compareAnnouncements({ playerId: 0, teamId: 0, type: "tierce", value: 20, suit: "clubs", highestRank: "9" }, { playerId: 1, teamId: 1, type: "tierce", value: 20, suit: "hearts", highestRank: "9" }, at)).toBe(0));
  it("supports Coinche in no-trump", () => { let state = createInitialGame(() => 0.01, { ruleset: rules(true, false) }); state = makeBid(state, 0, { action: "bid", value: 80, contractMode: nt }); expect(makeBid(state, 1, { action: "coinche" }).bids.at(-1)?.action).toBe("coinche"); });
  it("supports Surcoinche in all-trump", () => { let state = createInitialGame(() => 0.01, { ruleset: rules(false, true) }); state = makeBid(state, 0, { action: "bid", value: 80, contractMode: at }); state = makeBid(state, 1, { action: "coinche" }); expect(makeBid(state, 2, { action: "surcoinche" }).contract?.status).toBe("surcoinched"); });
  it("keeps legacy trump states playable", () => { const state = biddingState(suit); delete state.contractMode; expect(playableCardsForCurrentPlayer(state).length).toBeGreaterThan(0); });
  it("keeps contree-kffr special flags disabled", () => expect([CONTREE_KFFR_RULESET.bidding.allowNoTrump, CONTREE_KFFR_RULESET.bidding.allowAllTrump]).toEqual([false, false]));
  it("accepts special-enabled rulesets", () => expect(() => validateRuleset(rules(true, true))).not.toThrow());
  it("MC always returns a legal no-trump card", () => { const state = biddingState(nt); expect(playableCardsForCurrentPlayer(state)).toContainEqual(chooseMonteCarloCardToPlay(state, { totalBudget: 1 })); });
  it("MC always returns a legal all-trump card", () => { const state = biddingState(at); expect(playableCardsForCurrentPlayer(state)).toContainEqual(chooseMonteCarloCardToPlay(state, { totalBudget: 1 })); });
  it("serializes the explicit Bot Review mode", () => { const state = biddingState(nt); const card = playableCardsForCurrentPlayer(state)[0]; expect(captureBotReviewScenario(state, { decisionNumber: 1, elapsedMs: 1, chosenCard: card }).contractMode).toEqual(nt); });
  it("plays a full legal special-mode card", () => { const state = biddingState(at); const card = playableCardsForCurrentPlayer(state)[0]; expect(playCard(state, state.currentPlayerId, card).currentTrick.cards).toHaveLength(1); });
});
