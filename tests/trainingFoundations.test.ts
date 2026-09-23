import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as legacy from "@/tests/helpers/legacyTrickKnowledge";
import * as adapter from "@/bots/strategy/trickKnowledge";
import { cardId } from "@/engine/cards";
import { buildTableKnowledge, getCutRiskBySuit, getVisibleCards } from "@/engine/knowledge/tableKnowledge";
import { generateTrainingPosition, generateTrainingSeries, generatorVersion } from "@/engine/training/generator";
import { createTrainingAxisRegistry } from "@/engine/training/registry";
import type { PlayerId } from "@/engine/types";

const version = generatorVersion;
const knowledgeFunctions = [
  "getVisibleCards", "getPlayedCards", "inferVoidSuitsByPlayer", "getPlayedTrumps",
  "getRemainingTrumps", "getMasterCardsStillOutBySuit", "getRemainingCardsBySuit",
  "getCutRiskBySuit", "getDeadSuits", "getWeakenedSuits", "buildTrickKnowledge",
] as const;

describe("training engine foundations", () => {
  it("preserves every historical bot knowledge export on 500 seeded legal positions", () => {
    for (let seed = 370000; seed < 370500; seed += 1) {
      const { state } = generateTrainingPosition({ seed, generatorVersion: version });
      for (const name of knowledgeFunctions) {
        expect(adapter[name](state), `${name} at seed ${seed}`).toStrictEqual(legacy[name](state));
      }
    }
  });

  it("uses the viewer seat for visible cards and cut risk", () => {
    const state = generateTrainingPosition({ seed: 370037, generatorVersion: version }).state;
    state.currentPlayerId = 2;
    for (const viewerId of [0, 1, 2, 3] as PlayerId[]) {
      expect(getVisibleCards(state, viewerId).slice(0, state.hands[viewerId].length)).toEqual(state.hands[viewerId]);
    }
    expect(getVisibleCards(state, 0)).not.toEqual(getVisibleCards(state, 1));
    const fixedViewer = buildTableKnowledge(state, 0);
    state.currentPlayerId = 3;
    expect(buildTableKnowledge(state, 0)).toStrictEqual(fixedViewer);

    // Public off-suit play identifies seat 1 as void in clubs.
    state.completedTricks = [{
      leaderId: 0,
      winnerId: 0,
      points: 0,
      cards: [
        { playerId: 0, card: { suit: "clubs", rank: "7" } },
        { playerId: 1, card: { suit: "diamonds", rank: "7" } },
        { playerId: 2, card: { suit: "clubs", rank: "8" } },
        { playerId: 3, card: { suit: "clubs", rank: "9" } },
      ],
    }];
    expect(getCutRiskBySuit(state, 0).clubs.knownVoidOpponents).toContain(1);
    expect(getCutRiskBySuit(state, 3).clubs.knownVoidPartner).toBe(true);
  });

  it("does not reveal opponent hands through table knowledge", () => {
    const state = generateTrainingPosition({ seed: 370038, generatorVersion: version }).state;
    const visible = getVisibleCards(state, 0).map(cardId);
    const otherHand = state.hands[1].map(cardId);
    expect(otherHand.some((card) => visible.includes(card))).toBe(false);
    const knowledge = buildTableKnowledge(state, 0);
    state.hands[1] = [...state.hands[1]].reverse();
    state.hands[2] = [];
    state.hands[3] = [];
    expect(buildTableKnowledge(state, 0)).toStrictEqual(knowledge);
  });

  it("generates stable, versioned, legal positions", () => {
    const first = generateTrainingPosition({ seed: 370039, generatorVersion: version });
    expect(JSON.stringify(first)).toBe(JSON.stringify(generateTrainingPosition({ seed: 370039, generatorVersion: version })));
    expect(generatorVersion).toBe(1);
    expect(first.generatorVersion).toBe(1);
    expect(first.state.phase).toBe("playing");
    const cards = [
      ...Object.values(first.state.hands).flat(),
      ...first.state.currentTrick.cards.map(({ card }) => card),
      ...first.state.completedTricks.flatMap((trick) => trick.cards.map(({ card }) => card)),
    ];
    expect(cards).toHaveLength(32);
    expect(new Set(cards.map(cardId)).size).toBe(32);
    expect(first).not.toStrictEqual(generateTrainingPosition({ seed: 370040, generatorVersion: version }));
    expect(generateTrainingSeries({ seed: 370039, generatorVersion: version, count: 10 })).toHaveLength(10);
    expect(() => generateTrainingPosition({ seed: 1, generatorVersion: 2 })).toThrow();
  });

  it("registers and resolves axis contracts", () => {
    const axis = { id: "sample", label: "Sample", createExercise: () => ({ answer: 1 }) };
    const registry = createTrainingAxisRegistry();
    registry.register(axis);
    expect(registry.resolve("sample")).toBe(axis);
    expect(registry.list()).toEqual([axis]);
    expect(() => registry.register(axis)).toThrow();
    expect(() => registry.resolve("missing")).toThrow();
  });

  it("keeps knowledge and training imports inside the pure engine", () => {
    for (const directory of ["engine/knowledge", "engine/training"]) {
      for (const entry of readdirSync(directory)) {
        if (!entry.endsWith(".ts")) continue;
        const source = readFileSync(`${directory}/${entry}`, "utf8");
        expect(source, entry).not.toMatch(/(?:from\s*["']|import\s*\(["'])(?:@\/)?(?:app\/|components\/|lib\/|@supabase\/)/);
      }
    }
  });
});
