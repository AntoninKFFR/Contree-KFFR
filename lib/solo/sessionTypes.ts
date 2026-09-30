import type { GameAction } from "@/engine/actions";
import type { GameState } from "@/engine/types";

export type SoloSession = { id: string; version: number; state: GameState };
export type SoloIntent = GameAction | { type: "advance-bot" };
export type SoloTransport = {
  start: (rules: unknown, startKey: string) => Promise<SoloSession | null>;
  load: () => Promise<SoloSession | null>;
  move: (session: SoloSession, intent: SoloIntent) => Promise<SoloSession>;
};
