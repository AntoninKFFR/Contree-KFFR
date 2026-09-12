import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createInitialGame } from "@/engine/game";
import { buildRoomRulesFields } from "@/engine/rulesets/room";
import {
  PRODUCT_GAME_LABEL,
  PRODUCT_SCORING_MODE,
  scoringModeLabel,
} from "@/lib/productGame";

describe("single product game mode", () => {
  it("creates new engine games with the internal ffb mode", () => {
    expect(PRODUCT_SCORING_MODE).toBe("ffb");
    expect(createInitialGame(() => 0.1).settings.scoringMode).toBe(PRODUCT_SCORING_MODE);
  });

  it("uses Contrée classique as the public label while keeping legacy history readable", () => {
    expect(PRODUCT_GAME_LABEL).toBe("Contrée classique");
    expect(scoringModeLabel("ffb")).toBe("Contrée classique");
    expect(scoringModeLabel("made-points")).toBe("Points faits (ancien mode)");
    expect(scoringModeLabel("announced-points")).toBe("Points annoncés (ancien mode)");
  });

  it("does not expose a scoring-mode selector in either new-game interface", () => {
    for (const path of [
      "app/solo/SoloPageClient.tsx",
      "app/multiplayer/MultiplayerPageClient.tsx",
    ]) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain("Mode de score");
      expect(source).not.toContain("made-points");
      expect(source).not.toContain("announced-points");
      expect(source).not.toContain("Coinche FFB");
    }
  });

  it("builds scoring from validated rules at the server boundary and ignores a client scalar mode", () => {
    const service = readFileSync("lib/server/multiplayerService.ts", "utf8");
    const api = readFileSync("lib/multiplayerApi.ts", "utf8");
    expect(service).toContain("buildRoomRulesFields(input.rules)");
    expect(service).not.toContain("input.scoringMode");
    expect(api).not.toContain("scoringMode:");
    expect(buildRoomRulesFields(undefined).scoring_mode).toBe(PRODUCT_SCORING_MODE);
    expect(buildRoomRulesFields({
      presetId: "contree-kffr",
      overrides: { scoring: { mode: "contract-only" } },
    }).scoring_mode).toBe("announced-points");
  });
});
