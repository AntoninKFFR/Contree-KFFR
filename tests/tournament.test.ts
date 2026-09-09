import { describe, expect, it } from "vitest";
import { createDeck } from "@/engine/cards";
import { createSeededRandom, fisherYatesShuffle } from "@/engine/random";
import { findBotStrategy } from "@/simulation/botRegistry";
import { formatTournament, runPairedMatchup, runRoundRobin } from "@/simulation/tournament";

describe("tournament harness", () => {
  it("uses exactly the same seeds in both paired orientations", () => {
    const games = runPairedMatchup(findBotStrategy("main"), findBotStrategy("balanced"), 4, 700);
    expect(games.map((game) => game.seed)).toEqual([700, 700, 701, 701]);
    expect(games[0].teamStrategies).toEqual({ 0: "main", 1: "balanced" });
    expect(games[1].teamStrategies).toEqual({ 0: "balanced", 1: "main" });
  });

  it("builds ranking and complete head-to-head results", () => {
    const result = runRoundRobin([findBotStrategy("main"), findBotStrategy("balanced"), findBotStrategy("aggressive")], 2, 800);
    expect(result.totalGames).toBe(6);
    expect(result.ranking).toHaveLength(3);
    expect(result.headToHead).toHaveLength(3);
    expect(formatTournament(result)).toContain("HEAD-TO-HEAD");
  });
});

describe("seeded Fisher-Yates shuffle", () => {
  it("is reproducible, complete and generally differs for another seed", () => {
    const deck = createDeck();
    const first = fisherYatesShuffle(deck, createSeededRandom(10));
    const repeated = fisherYatesShuffle(deck, createSeededRandom(10));
    const other = fisherYatesShuffle(deck, createSeededRandom(11));
    expect(first).toEqual(repeated);
    expect(first).not.toEqual(other);
    expect(new Set(first.map((card) => `${card.rank}-${card.suit}`)).size).toBe(deck.length);
    expect(first).toHaveLength(deck.length);
  });
});
