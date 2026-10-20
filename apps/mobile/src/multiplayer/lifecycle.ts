import { PRESENCE_HEARTBEAT_INTERVAL_MS } from "../../../../lib/multiplayerPresence";
import { botPacingDelayMs, MULTIPLAYER_TICK_INTERVAL_MS } from "../../../../lib/multiplayerTurnTimer";
import { normalizeMultiplayerTablePreferences } from "../../../../lib/multiplayerTablePreferences";
import type { createRoomController } from "./controller";

type Controller = ReturnType<typeof createRoomController>;
export function tickDelay(room: NonNullable<Controller["state"]["room"]>, now: number) {
  const game = room.game, seat = room.players.find((p) => p.seat_index === game?.currentPlayerId);
  if (!game || !["playing", "bidding"].includes(game.phase) || !(seat?.kind === "bot" || seat?.bot_takeover)) return MULTIPLAYER_TICK_INTERVAL_MS;
  const due = Date.parse(room.room.updated_at) + botPacingDelayMs(game.phase as "bidding" | "playing", game.currentTrick.cards.length, game.completedTricks.length, normalizeMultiplayerTablePreferences(room.room.presentation_settings));
  return Number.isFinite(due) ? Math.max(0, due - now) + 30 : MULTIPLAYER_TICK_INTERVAL_MS;
}
/** One sequential maintenance loop per focused foreground room. No DOM timers. */
export function startRoomLifecycle(controller: Controller, clock = { now: () => Date.now(), setTimeout: (fn: () => void, delay: number) => setTimeout(fn, delay), clearTimeout: (timer: ReturnType<typeof setTimeout>) => clearTimeout(timer) }) {
  let live = true, timer: ReturnType<typeof setTimeout> | undefined, heartbeat = -Infinity, refresh = clock.now(), tick = clock.now(), version = -1;
  async function run() {
    if (!live) return;
    const now = clock.now(), state = controller.state, room = state.room;
    if (state.active && !state.busy) {
      if (state.requiresSync || now - refresh >= MULTIPLAYER_TICK_INTERVAL_MS) { refresh = now; await controller.load(); }
      if (!live) return;
      if (controller.state.room?.viewerSeatIndex != null && now - heartbeat >= PRESENCE_HEARTBEAT_INTERVAL_MS) { heartbeat = now; await controller.maintain("heartbeat"); }
      if (!live) return;
      if (room?.room.status === "playing" && room.viewerSeatIndex !== null) {
        if (version !== room.room.state_version) { version = room.room.state_version; tick = now + tickDelay(room, now); }
        if (now >= tick) { tick = now + (tickDelay(room, now) <= 30 ? 500 : MULTIPLAYER_TICK_INTERVAL_MS); await controller.maintain("tick"); }
      }
    }
    if (live) timer = clock.setTimeout(run, 250);
  }
  void run();
  return () => { live = false; if (timer !== undefined) clock.clearTimeout(timer); };
}
