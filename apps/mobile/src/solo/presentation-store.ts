import { observeCompletedTricks, completedTrickKey, planTrickLayerPresentations, selectTrickLayers, type TrickObservation, type PresentedTrick, type CardPresentation } from "../../../../lib/trickPresentation";
import type { NativeSoloSession } from "./contract";
export type PresentationSnapshot = {
  observation: TrickObservation | null; queue: PresentedTrick[]; collected: string[]; lastCollected: string | null; cards: Map<string, CardPresentation>;
};
export function deriveTablePresentation(snapshot: PresentationSnapshot, session: NativeSoloSession | null, animate: boolean) {
  const game = session?.state, transition = game && session ? observeCompletedTricks(snapshot.observation, { completedTricks: game.completedTricks, roundNumber: game.roundNumber, scope: session.id }) : null;
  const presented = transition?.reset ? null : snapshot.queue[0] ?? transition?.additions[0] ?? null;
  const layers = game && session ? selectTrickLayers({ scope: session.id, roundNumber: game.roundNumber, completedCount: game.completedTricks.length, currentCards: game.currentTrick.cards, presented, followingCompletedTricks: presented ? game.completedTricks.slice(presented.trickIndex) : [] }) : [];
  return { presented, layers, cardPresentations: planTrickLayerPresentations(snapshot.cards, layers, animate) };
}
/** Observable presentation queue only. It never changes the authoritative game. */
export function createTablePresentationStore() {
  let snapshot: PresentationSnapshot = { observation: null, queue: [], collected: [], lastCollected: null, cards: new Map() };
  const listeners = new Set<() => void>();
  const publish = (next: PresentationSnapshot) => { snapshot = next; for (const listener of listeners) listener(); };
  return {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    observe(session: NativeSoloSession | null, animate: boolean) {
      if (!session) { if (snapshot.observation) publish({ observation: null, queue: [], collected: [], lastCollected: null, cards: new Map() }); return; }
      const game = session.state;
      const next = observeCompletedTricks(snapshot.observation, { completedTricks: game.completedTricks, roundNumber: game.roundNumber, scope: session.id });
      const view = deriveTablePresentation(snapshot, session, animate);
      publish({ observation: next.observation, queue: next.reset ? [] : [...snapshot.queue, ...next.additions],
        collected: next.reset ? game.completedTricks.map((trick, i) => completedTrickKey(game.roundNumber, i + 1, trick)) : snapshot.collected,
        lastCollected: next.reset ? null : snapshot.lastCollected, cards: view.cardPresentations });
    },
    collect() {
      const trick = snapshot.queue[0]; if (!trick) return;
      publish({ ...snapshot, queue: snapshot.queue.slice(1), collected: [...snapshot.collected, trick.key], lastCollected: trick.key });
    },
  };
}
