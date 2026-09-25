import { describe, expect, it } from "vitest";
import { emptyTrainingProgress } from "@/components/training/progress";
import { defaultInGameConfiguration, parseInGameConfiguration, readInGameConfiguration,
  saveInGameConfiguration, TRAINING_GAME_SETTINGS_KEY } from "@/lib/training/inGameSettings";

function storage() {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); } };
}

describe("in-game training settings", () => {
  it("starts playable with trick-value level 1 and three questions per round", () => {
    const defaults = defaultInGameConfiguration();
    expect(defaults.budgetPerRound).toBe(3);
    expect(defaults.axes.find((axis) => axis.id === "trick-value")).toEqual({ id: "trick-value", enabled: true, level: 1 });
    expect(defaults.axes.map((axis) => axis.id)).toEqual([
      "trick-value", "opponent-voids", "master-cards", "master-in-hand", "played-cards", "trick-recall",
    ]);
    expect(defaults.axes.map((axis) => axis.id)).not.toContain("pile-count");
  });

  it("saves and reloads only the dedicated local configuration", () => {
    const local = storage();
    const chosen = { ...defaultInGameConfiguration(), budgetPerRound: 2 as const,
      axes: defaultInGameConfiguration().axes.map((axis) => axis.id === "master-cards" ? { ...axis, enabled: true } : axis) };
    saveInGameConfiguration(chosen, local);
    expect(local.getItem(TRAINING_GAME_SETTINGS_KEY)).toContain('"budgetPerRound":2');
    expect(readInGameConfiguration(emptyTrainingProgress(), local)).toEqual(chosen);
  });

  it("recovers from corrupt data and ignores unknown axes", () => {
    const progress = emptyTrainingProgress();
    expect(parseInGameConfiguration("{", progress)).toEqual(defaultInGameConfiguration());
    expect(parseInGameConfiguration(JSON.stringify({ version: 1, budgetPerRound: 2,
      axes: [{ id: "unknown-axis", enabled: true, level: 1 }] }), progress)).toEqual({
      ...defaultInGameConfiguration(), budgetPerRound: 2,
    });
  });

  it("normalizes invalid budgets and levels to currently unlocked levels", () => {
    const progress = emptyTrainingProgress();
    progress.axes["master-cards"].unlockedLevel = 2;
    const parsed = parseInGameConfiguration(JSON.stringify({ version: 1, budgetPerRound: 99, axes: [
      { id: "master-cards", enabled: true, level: 3 },
      { id: "trick-value", enabled: true, level: -5 },
      { id: "opponent-voids", enabled: true, level: "2" },
    ] }), progress);
    expect(parsed.budgetPerRound).toBe(3);
    expect(parsed.axes.find((axis) => axis.id === "master-cards")?.level).toBe(2);
    expect(parsed.axes.find((axis) => axis.id === "trick-value")?.level).toBe(1);
    expect(parsed.axes.find((axis) => axis.id === "opponent-voids")?.level).toBe(1);
  });
});
