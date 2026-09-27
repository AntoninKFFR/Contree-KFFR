import { TrainingOwnHand } from "@/components/training/MemoryStudyPhase";
import { SUIT_SYMBOLS } from "@/engine/cards";
import { formatContractLabel } from "@/engine/contractMode";
import type { BiddingExercise } from "@/engine/training/bidding";
import type { Bid, PlayerId } from "@/engine/types";

const ROLES: Record<PlayerId, string> = {
  0: "Toi", 1: "Adversaire droite", 2: "Partenaire", 3: "Adversaire gauche",
};

function publicBidLabel(bid: Bid): string {
  if (bid.action === "pass") return "Passe";
  if (bid.action === "coinche") return "Coinche";
  if (bid.action === "surcoinche") return "Surcoinche";
  const suit = bid.contractMode?.kind === "suit" ? bid.contractMode.suit : bid.trump;
  if (bid.action === "capot") return `Capot ${suit ? SUIT_SYMBOLS[suit] : ""}`.trim();
  if (bid.action === "generale") return `Générale ${suit ? SUIT_SYMBOLS[suit] : ""}`.trim();
  return `${bid.value} ${suit ? SUIT_SYMBOLS[suit] : ""}`.trim();
}

export function BiddingExerciseBoard({ exercise }: { exercise: BiddingExercise }) {
  return <div className="grid min-w-0 gap-3 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
    <TrainingOwnHand cards={exercise.ownHand} />
    <section aria-label="Historique public des enchères" className="min-w-0 rounded-xl border border-[var(--border)] p-3">
      <h2 className="text-sm font-black">Enchères publiques</h2>
      <p className="mt-1 text-xs text-[var(--text-secondary)]">Tu joues avec le partenaire en face de toi.</p>
      {exercise.publicBids.length === 0
        ? <p className="mt-3 text-sm">Tu parles en premier.</p>
        : <ol className="mt-3 flex flex-wrap gap-1.5">
          {exercise.publicBids.map((bid, index) => <li key={index} className="min-w-0 rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] px-2 py-1 text-xs">
            <span className="font-bold">{ROLES[bid.playerId]}</span><span className="text-[var(--text-secondary)]"> · {exercise.playerNames[bid.playerId]}</span>
            <span className="block font-semibold">{publicBidLabel(bid)}</span>
          </li>)}
        </ol>}
      {exercise.currentContract ? <p className="mt-3 text-xs font-semibold">Contrat actuel : {formatContractLabel(exercise.currentContract)}</p> : null}
    </section>
  </div>;
}
