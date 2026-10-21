import { mkdirSync, writeFileSync } from "node:fs";
import { memoryMultiplayerServer } from "../tests/helpers/nativeMultiplayerServer";
import { playableCardsForCurrentPlayer } from "../engine/game";
import type { Card, ContractMode } from "../engine/types";
const users = ["web", "ios", "third", "fourth"];
function table() {
  const s = memoryMultiplayerServer(71);
  s.intent("web", s.room.state_version, { type: "update-room-rules", rules: { presetId: "contree-kffr", overrides: { bidding: { allowNoTrump: true, allowAllTrump: true } } } });
  for (const seat of [1, 2, 3] as const) s.intent(users[seat], s.room.state_version, { type: "join-seat", seatIndex: seat });
  for (const user of users) s.intent(user, s.room.state_version, { type: "set-ready", ready: true });
  s.intent("web", s.room.state_version, { type: "start-game" }); return s;
}
const sequences = [0, 1, 2, 3].map((viewer) => {
  const s = table();
  while (s.game!.phase === "bidding") s.intent(users[s.game!.currentPlayerId], s.room.state_version, { type: "game-action", action: s.game!.bids.length ? { type: "pass" } : { type: "bid", value: 80, trump: "hearts" } });
  const states = [], plays: Card[] = [];
  while (s.game!.phase === "playing") {
    const card = playableCardsForCurrentPlayer(s.game!)[0];
    if (s.game!.currentPlayerId === viewer) { states.push(s.view(users[viewer]).game!); plays.push(card); }
    s.intent(users[s.game!.currentPlayerId], s.room.state_version, { type: "game-action", action: { type: "play-card", card } });
  }
  return { states, plays };
});
const s = table(), auction: Record<string, unknown> = {};
const capture = (name: string) => { auction[name] = users.map((user) => s.view(user).game!); };
capture("empty");
for (const [i, mode] of ([{ kind: "suit", suit: "hearts" }, { kind: "suit", suit: "clubs" }, { kind: "no-trump" }, { kind: "all-trump" }] as ContractMode[]).entries()) {
  s.intent(users[s.game!.currentPlayerId], s.room.state_version, { type: "game-action", action: { type: "bid", value: (80 + i * 10) as 80, contractMode: mode } }); capture(["hearts", "clubs", "sa", "ta"][i]);
}
s.intent(users[s.game!.currentPlayerId], s.room.state_version, { type: "game-action", action: { type: "coinche" } }); capture("coinche");
s.intent(users[s.game!.currentPlayerId], s.room.state_version, { type: "game-action", action: { type: "surcoinche" } }); capture("surcoinche");
while (s.game!.phase === "bidding") s.intent(users[s.game!.currentPlayerId], s.room.state_version, { type: "game-action", action: { type: "pass" } });
capture("confirmed");
mkdirSync("apps/mobile/tests/hand", { recursive: true });
writeFileSync("apps/mobile/tests/hand/states.json", JSON.stringify({ sequences, auction }, null, 2) + "\n");
console.log("Public-only native hand fixtures: four viewers, eight hand sizes, all auction modes.");
