import { mkdirSync, writeFileSync } from "node:fs";
import { playableCardsForCurrentPlayer } from "../engine/game";
import { memoryMultiplayerServer } from "../tests/helpers/nativeMultiplayerServer";
const users = ["web", "ios", "third", "fourth"];
const fixtures = Object.fromEntries((["round", "game"] as const).map((kind) => {
  // Find a real deal whose fourth final card belongs to the Solo human too.
  for (let seed = 71; seed < 171; seed++) {
    const server = memoryMultiplayerServer(seed);
    const send = (user: string, intent: Parameters<typeof server.intent>[2]) => server.intent(user, server.room.state_version, intent);
    send("web", { type: "update-room-rules", rules: { presetId: "contree-kffr", overrides: { game: { targetScore: kind === "game" ? 100 : 1000 } } } });
    for (const seat of [1, 2, 3] as const) send(users[seat], { type: "join-seat", seatIndex: seat });
    for (const user of users) send(user, { type: "set-ready", ready: true });
    send("web", { type: "start-game" });
    for (let step = 0; step < 60 && server.game && ["bidding", "playing"].includes(server.game.phase); step++) {
      const game = server.game;
      const action = game.phase === "bidding" ? game.bids.some((bid) => bid.action !== "pass") ? { type: "pass" as const } : { type: "bid" as const, value: 80 as const, trump: "spades" as const }
        : { type: "play-card" as const, card: playableCardsForCurrentPlayer(game)[0] };
      if (game.phase === "playing" && game.completedTricks.length === 7 && game.currentTrick.cards.length === 3) {
        if (game.currentPlayerId !== 0) break;
        const before = users.map((user) => server.view(user));
        send("web", { type: "game-action", action });
        const after = users.map((user) => server.view(user));
        return [kind, { seed, before, after, action }];
      }
      send(users[game.currentPlayerId], { type: "game-action", action });
    }
  }
  throw new Error(`No final trick fixture found for ${kind}`);
}));
mkdirSync("apps/mobile/tests/final-trick", { recursive: true });
writeFileSync("apps/mobile/tests/final-trick/states.json", JSON.stringify(fixtures, null, 2) + "\n");
console.log("Generated authoritative public-only final trick fixtures: round and game, human fourth card, all four viewers.");
