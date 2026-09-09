import { describe, expect, it } from "vitest";
import { createDeck, sameCard } from "@/engine/cards";
import { cardPoints } from "@/engine/rules";
import type { Bid, Card, CompletedTrick, GameState, PlayerId, Suit } from "@/engine/types";
import { buildBotKnowledgeV3, cardBeliefWeight } from "@/bots/strategy/botKnowledgeV3";
import {
  chooseMonteCarloV3Decision,
  createPlausibleStateV3,
  V3_1_OPTIONS,
} from "@/bots/strategy/monteCarloV3CardStrategy";

const c = (rank: Card["rank"], suit: Suit): Card => ({ rank, suit });
const key = (card: Card) => `${card.rank}-${card.suit}`;

function trick(
  cards: Array<[PlayerId, Card]>,
  winnerId: PlayerId = cards[0][0],
): CompletedTrick {
  return {
    leaderId: cards[0][0],
    cards: cards.map(([playerId, card]) => ({ playerId, card })),
    winnerId,
    points: cards.reduce((sum, [, card]) => sum + cardPoints(card, "spades"), 0),
  };
}

function botLabState({
  own,
  current = [],
  completed = [],
  bids = [{ playerId: 0, action: "bid", value: 80, trump: "spades" }],
  trump = "spades",
}: {
  own: Card[];
  current?: Array<[PlayerId, Card]>;
  completed?: CompletedTrick[];
  bids?: Bid[];
  trump?: Suit;
}): GameState {
  const currentPlayerId = ((current.length ? current[0][0] + current.length : 0) % 4) as PlayerId;
  const publicCards = [
    ...current.map(([, card]) => card),
    ...completed.flatMap((item) => item.cards.map((play) => play.card)),
  ];
  const used = new Set([...own, ...publicCards].map(key));
  const pool = createDeck().filter((card) => !used.has(key(card)));
  const playedCount = { 0: 0, 1: 0, 2: 0, 3: 0 } as Record<PlayerId, number>;
  for (const item of completed) for (const play of item.cards) playedCount[play.playerId] += 1;
  for (const [player] of current) playedCount[player] += 1;
  const hands = { 0: [], 1: [], 2: [], 3: [] } as GameState["hands"];
  hands[currentPlayerId] = own;
  let cursor = 0;
  for (const player of [0, 1, 2, 3] as PlayerId[]) {
    if (player === currentPlayerId) continue;
    const count = 8 - playedCount[player];
    hands[player] = pool.slice(cursor, cursor + count);
    cursor += count;
  }
  return {
    settings: { scoringMode: "made-points", targetScore: 1000 },
    phase: "playing",
    roundNumber: 1,
    startingPlayerId: 0,
    totalScore: { 0: 0, 1: 0 },
    roundHistory: [],
    winnerTeam: null,
    trump,
    hands,
    currentPlayerId,
    currentTrick: { leaderId: current.length ? current[0][0] : currentPlayerId, cards: current.map(([playerId, card]) => ({ playerId, card })) },
    completedTricks: completed,
    bids,
    contract: { playerId: 0, teamId: 0, value: 80, trump, status: "normal" },
    result: null,
    trickPoints: { 0: 0, 1: 0 },
    roundScore: { 0: 0, 1: 0 },
    message: "Bot Lab V3",
  };
}

const fillers = [c("7", "diamonds"), c("8", "diamonds"), c("Q", "diamonds"), c("K", "diamonds"), c("7", "hearts"), c("8", "hearts")];
const v3Family = (state: GameState) => [
  chooseMonteCarloV3Decision(state),
  chooseMonteCarloV3Decision(state, V3_1_OPTIONS),
];

describe("Bot Lab Monte Carlo V3", () => {
  it("1. partenaire maître : conserve As et 10", () => {
    const state = botLabState({ own: [c("7", "clubs"), c("10", "clubs"), c("A", "clubs"), ...fillers.slice(0, 5)], current: [[1, c("K", "clubs")], [2, c("J", "spades")], [3, c("8", "clubs")]] });
    for (const decision of v3Family(state)) expect(decision.card).toEqual(c("7", "clubs"));
  });

  it("2. gagner au minimum : prend avec le 10 plutôt que l'As", () => {
    const state = botLabState({ own: [c("10", "clubs"), c("A", "clubs"), ...fillers], current: [[1, c("K", "clubs")], [2, c("10", "hearts")], [3, c("8", "clubs")]] });
    for (const decision of v3Family(state)) expect(decision.card).toEqual(c("10", "clubs"));
  });

  it("3. pli impossible : ne jette pas un gros point", () => {
    const state = botLabState({ own: [c("7", "clubs"), c("A", "clubs"), ...fillers], current: [[1, c("K", "clubs")], [2, c("J", "spades")], [3, c("8", "clubs")]] });
    for (const decision of v3Family(state)) expect(decision.card).toEqual(c("7", "clubs"));
  });

  it("4. adversaire coupe : évite l'As vulnérable", () => {
    const previous = trick([[0, c("7", "clubs")], [1, c("7", "hearts")], [2, c("8", "clubs")], [3, c("9", "clubs")]], 3);
    const state = botLabState({ own: [c("A", "clubs"), c("7", "diamonds"), c("8", "diamonds"), c("Q", "diamonds"), c("K", "diamonds"), c("8", "hearts"), c("Q", "hearts")], completed: [previous] });
    for (const decision of v3Family(state)) expect(decision.card).not.toEqual(c("A", "clubs"));
  });

  it("5. partenaire coupe : ouvre la couleur de coupe", () => {
    const previous = trick([[0, c("7", "clubs")], [1, c("8", "clubs")], [2, c("7", "hearts")], [3, c("9", "clubs")]], 3);
    const state = botLabState({ own: [c("Q", "clubs"), c("7", "diamonds"), c("8", "diamonds"), c("Q", "diamonds"), c("K", "diamonds"), c("8", "hearts"), c("Q", "hearts")], completed: [previous] });
    for (const decision of v3Family(state)) expect(decision.card.suit).toBe("clubs");
  });

  it("6. atout fort : le petit atout suffit", () => {
    const state = botLabState({ own: [c("8", "spades"), c("J", "spades"), ...fillers], current: [[1, c("7", "spades")], [2, c("A", "clubs")], [3, c("7", "clubs")]] });
    for (const decision of v3Family(state)) expect(decision.card).toEqual(c("8", "spades"));
  });

  it("7. carte maîtresse : reconnaît le 10 après la chute de l'As", () => {
    const previous = trick([[0, c("7", "hearts")], [1, c("A", "hearts")], [2, c("8", "hearts")], [3, c("9", "hearts")]], 1);
    const state = botLabState({ own: [c("10", "hearts"), c("7", "diamonds"), c("8", "diamonds"), c("Q", "diamonds"), c("K", "diamonds"), c("8", "clubs"), c("Q", "clubs")], completed: [previous] });
    expect(buildBotKnowledgeV3(state).ownMasterCards).toContainEqual(c("10", "hearts"));
  });

  it("8. tirage atout : tire avec contrôle clair", () => {
    const state = botLabState({ own: [c("J", "spades"), c("7", "spades"), c("8", "spades"), c("7", "clubs"), c("8", "clubs"), c("Q", "clubs"), c("7", "diamonds"), c("8", "diamonds")] });
    for (const decision of v3Family(state)) expect(decision.card.suit).toBe("spades");
  });

  it("9. ne pas tirer atout : conserve la coupe utile du partenaire", () => {
    const previous = trick([[0, c("7", "clubs")], [1, c("8", "clubs")], [2, c("7", "hearts")], [3, c("9", "clubs")]], 3);
    const state = botLabState({ own: [c("J", "spades"), c("9", "spades"), c("7", "spades"), c("Q", "clubs"), c("7", "diamonds"), c("8", "diamonds"), c("Q", "diamonds")], completed: [previous] });
    for (const decision of v3Family(state)) expect(decision.card.suit).not.toBe("spades");
  });

  it("10. quatrième, partenaire maître : économise sa force", () => {
    const state = botLabState({ own: [c("7", "clubs"), c("A", "clubs"), ...fillers], current: [[1, c("K", "clubs")], [2, c("J", "spades")], [3, c("10", "clubs")]] });
    for (const decision of v3Family(state)) expect(decision.card).toEqual(c("7", "clubs"));
  });

  it("11. quatrième, adversaire maître : gagne au minimum", () => {
    const state = botLabState({ own: [c("10", "clubs"), c("A", "clubs"), ...fillers], current: [[1, c("K", "clubs")], [2, c("7", "clubs")], [3, c("8", "clubs")]] });
    for (const decision of v3Family(state)) expect(decision.card).toEqual(c("10", "clubs"));
  });

  it("12. fin de manche : utilise la recherche bornée plutôt qu'un choix gourmand", () => {
    const deck = createDeck();
    const completed = Array.from({ length: 5 }, (_, index) => trick([
      [0, deck[index * 4]], [1, deck[index * 4 + 1]], [2, deck[index * 4 + 2]], [3, deck[index * 4 + 3]],
    ], 0));
    const used = new Set(completed.flatMap((item) => item.cards.map((play) => key(play.card))));
    const own = deck.filter((card) => !used.has(key(card))).slice(0, 3);
    const state = botLabState({ own, completed });
    const decision = chooseMonteCarloV3Decision(state, { seed: 73, totalBudget: 12, disableTactics: true, nodeCap: 4000 });
    expect(decision.source).toBe("endgame");
    expect(state.hands[0].some((card) => sameCard(card, decision.card))).toBe(true);
    expect(decision.nodes).toBeGreaterThan(0);
    const v31 = chooseMonteCarloV3Decision(state, { ...V3_1_OPTIONS, seed: 73, totalBudget: 12 });
    expect(state.hands[0].some((card) => sameCard(card, v31.card))).toBe(true);
  });

  it("respecte les contraintes fortes de couleur dans toutes les distributions produites", () => {
    const previous = trick([[0, c("7", "clubs")], [1, c("7", "hearts")], [2, c("8", "clubs")], [3, c("9", "clubs")]], 3);
    const state = botLabState({ own: [c("A", "clubs"), c("7", "diamonds"), c("8", "diamonds"), c("Q", "diamonds"), c("K", "diamonds"), c("8", "hearts"), c("Q", "hearts")], completed: [previous] });
    let generated = 0;
    for (let seed = 1; seed <= 10; seed += 1) {
      const plausible = createPlausibleStateV3(state, (() => { let value = seed; return () => ((value = Math.imul(value, 1664525) + 1013904223) >>> 0) / 4294967296; })());
      if (plausible) {
        generated += 1;
        expect(plausible.hands[1].some((card) => card.suit === "clubs")).toBe(false);
        const allCards = [
          ...Object.values(plausible.hands).flat(),
          ...plausible.completedTricks.flatMap((item) => item.cards.map((play) => play.card)),
          ...plausible.currentTrick.cards.map((play) => play.card),
        ];
        expect(allCards).toHaveLength(32);
        expect(new Set(allCards.map(key)).size).toBe(32);
      }
    }
    expect(generated).toBeGreaterThan(0);
  });

  it("traite les annonces comme croyances pondérées et non comme certitudes", () => {
    const state = botLabState({ own: [c("7", "clubs"), c("8", "clubs"), c("Q", "clubs"), c("K", "clubs"), c("7", "diamonds"), c("8", "diamonds"), c("Q", "diamonds"), c("K", "diamonds")], bids: [{ playerId: 1, action: "bid", value: 120, trump: "hearts" }] });
    const knowledge = buildBotKnowledgeV3(state);
    expect(cardBeliefWeight(knowledge, 1, c("J", "hearts"), "hearts")).toBeGreaterThan(cardBeliefWeight(knowledge, 1, c("J", "clubs"), "hearts"));
    expect(knowledge.hardVoidSuits[1]).not.toContain("hearts");
  });

  it("ne triche pas : mêmes informations visibles et seed, même décision", () => {
    const state = botLabState({ own: [c("7", "clubs"), c("8", "clubs"), c("Q", "clubs"), c("K", "clubs"), c("7", "diamonds"), c("8", "diamonds"), c("Q", "diamonds"), c("K", "diamonds")] });
    const changed: GameState = { ...state, hands: { ...state.hands, 1: state.hands[2], 2: state.hands[3], 3: state.hands[1] } };
    expect(chooseMonteCarloV3Decision(state, { seed: 99, totalBudget: 15, disableTactics: true }).card).toEqual(
      chooseMonteCarloV3Decision(changed, { seed: 99, totalBudget: 15, disableTactics: true }).card,
    );
    expect(chooseMonteCarloV3Decision(state, { ...V3_1_OPTIONS, seed: 99, totalBudget: 15 }).card).toEqual(
      chooseMonteCarloV3Decision(changed, { ...V3_1_OPTIONS, seed: 99, totalBudget: 15 }).card,
    );
  });

  it("active réellement les ablations filtering et endgame sans dupliquer le bot", () => {
    const deck = createDeck();
    const completed = Array.from({ length: 5 }, (_, index) => trick([
      [0, deck[index * 4]], [1, deck[index * 4 + 1]], [2, deck[index * 4 + 2]], [3, deck[index * 4 + 3]],
    ], 0));
    const used = new Set(completed.flatMap((item) => item.cards.map((play) => key(play.card))));
    const state = botLabState({ own: deck.filter((card) => !used.has(key(card))).slice(0, 3), completed });
    const allLegal = chooseMonteCarloV3Decision(state, { seed: 5, totalBudget: 6, features: { candidateFiltering: false, endgameMinimax: false } });
    expect(allLegal.candidates).toHaveLength(state.hands[state.currentPlayerId].length);
    expect(allLegal.source).not.toBe("endgame");
  });
});
