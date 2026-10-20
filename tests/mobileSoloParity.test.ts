import { expect, it } from "vitest";
import { soloParityStates } from "../e2e/helpers/soloParityStates";
import { toPlayerGameView } from "@/engine/views";
import { playableCardsForCurrentPlayer } from "@/engine/game";
import { soloLegalHumanCards } from "@/lib/solo/publicState";
import { parseSoloResponse } from "../apps/mobile/src/solo/contract";
import { createTablePresentationStore, deriveTablePresentation } from "../apps/mobile/src/solo/presentation-store";
import { completedTrickKey } from "@/lib/trickPresentation";

const id = "33333333-3333-4333-8333-333333333333";
const states = soloParityStates();
const wire = (stage: keyof typeof states) => ({ data: { id, version: 1, state: JSON.parse(JSON.stringify(toPlayerGameView(states[stage], 0))) } });
for (const stage of Object.keys(states) as (keyof typeof states)[]) it(`preserves the full public web state for ${stage} and derives identical legal cards without opponent hands`, () => {
  const source = wire(stage), parsed = parseSoloResponse(source);
  expect(parsed.state).toEqual(source.data.state);
  expect(parsed.state).not.toHaveProperty("hands");
  expect(soloLegalHumanCards(parsed.state)).toEqual(states[stage].phase === "playing" ? playableCardsForCurrentPlayer(states[stage]) : []);
  const injected = structuredClone(source); injected.data.state.uncheckedPrivate = { hands: states[stage].hands }; injected.data.state.currentTrick.privateCard = states[stage].hands[1][0];
  expect(parseSoloResponse(injected).state).toEqual(parsed.state);
});
it("rejects malformed rich fields instead of allowing broken permissions or exposing hands", () => {
  for (const mutate of [
    (v: ReturnType<typeof wire>) => { v.data.state.hands = states.start.hands; },
    (v: ReturnType<typeof wire>) => { v.data.state.settings.ruleset.cardPlay.mustFollowSuit = "yes"; },
    (v: ReturnType<typeof wire>) => { v.data.state.bids[0].playerId = 7; },
    (v: ReturnType<typeof wire>) => { v.data.state.completedTricks[0].winnerId = 9; },
    (v: ReturnType<typeof wire>) => { v.data.state.result.multiplier = -2; },
  ]) { const source = wire("result"); mutate(source); expect(() => parseSoloResponse(source)).toThrow(/invalide/); }
});
it("queues newly completed tricks separately from current plays and never replays loaded or previous-session tricks", () => {
  const store = createTablePresentationStore(), start = parseSoloResponse(wire("start")), later = parseSoloResponse(wire("trick")), result = parseSoloResponse(wire("result"));
  store.observe(start, true); expect(store.getSnapshot().queue).toEqual([]);
  store.observe(later, true);
  expect(store.getSnapshot().queue).toHaveLength(later.state.completedTricks.length);
  const view = deriveTablePresentation(store.getSnapshot(), later, true);
  expect(view.layers[0].kind).toBe("completed"); expect(view.layers.at(-1)?.cards).toEqual(later.state.currentTrick.cards);
  const first = store.getSnapshot().queue[0]; store.collect();
  expect(store.getSnapshot().collected).toContain(first.key); expect(store.getSnapshot().lastCollected).toBe(first.key);
  store.observe(result, true); const pending = store.getSnapshot().queue.length;
  store.observe(result, true); expect(store.getSnapshot().queue).toHaveLength(pending);
  store.observe({ ...later, id: "44444444-4444-4444-8444-444444444444" }, true);
  expect(store.getSnapshot().queue).toEqual([]);
  expect(store.getSnapshot().collected).toContain(completedTrickKey(later.state.roundNumber, 1, later.state.completedTricks[0]));
  expect(deriveTablePresentation(store.getSnapshot(), later, false).cardPresentations.values().next().value?.animatedKeys).toEqual([]);
});
