import { mkdirSync, writeFileSync } from "node:fs";
import { memoryMultiplayerServer } from "../tests/helpers/nativeMultiplayerServer";
import { playableCardsForCurrentPlayer } from "../engine/game";
import type { MultiplayerRoomView } from "../lib/roomTypes";
const server = memoryMultiplayerServer(71), users = ["web", "ios", "third", "fourth"];
const stages: Record<string, MultiplayerRoomView[]> = {};
const capture = (stage: string) => { stages[stage] = users.map((id) => server.view(id)); };
server.intent("web", server.room.state_version, { type: "update-room-rules", rules: { presetId: "contree-kffr", overrides: { game: { targetScore: 100 } } } });
// Lobby views include only valid occupied viewer seats; guests initially observe.
capture("lobby-free");
for (const seat of [1, 2, 3] as const) server.intent(users[seat], server.room.state_version, { type: "join-seat", seatIndex: seat });
capture("lobby-full");
for (const user of users) server.intent(user, server.room.state_version, { type: "set-ready", ready: true });
server.intent("web", server.room.state_version, { type: "start-game" }); capture("bidding");
for (let step = 0; step < 2000 && server.game?.phase !== "game-over"; step++) {
  const game = server.game!;
  if (game.phase === "finished") server.intent("web", server.room.state_version, { type: "next-round" });
  else {
    const action = game.phase === "bidding" ? game.bids.some((b) => b.action !== "pass") ? { type: "pass" as const } : { type: "bid" as const, value: 80 as const, trump: "spades" as const }
      : { type: "play-card" as const, card: playableCardsForCurrentPlayer(game)[0] };
    server.intent(users[game.currentPlayerId], server.room.state_version, { type: "game-action", action });
  }
  const next = server.game!;
  if (next.phase === "playing" && !stages.start) capture("start");
  if (next.currentTrick.cards.length === 3 && !stages.trick) capture("trick");
  if (next.completedTricks.length === 1 && !stages.last) capture("last");
}
if (server.game?.phase !== "game-over") throw new Error("Fixture game did not end");
capture("result");
mkdirSync("apps/mobile/tests/multiplayer", { recursive: true });
writeFileSync("apps/mobile/tests/multiplayer/states.json", JSON.stringify(stages, null, 2) + "\n");
console.log("Generated public-only multiplayer states:", Object.keys(stages));
