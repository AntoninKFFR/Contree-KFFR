import { cardAccessibleName } from "@/components/training/CardSelection";
import { formatPublicBidLabel, TRAINING_BID_ROLES } from "@/components/training/bidRoles";
import { cardId, SUIT_SYMBOLS } from "@/engine/cards";
import { BID_READING_ASSERTION_LABELS, BID_READING_MEANING_LABELS, type BidReadingExercise } from "@/engine/training/bidReading";

type PublicAuctionData = Pick<BidReadingExercise, "publicBids" | "targetBidIndex" | "playerNames">;
type DoctrineData = Pick<BidReadingExercise, "promise" | "illustrationHand">;

export function BidReadingPublicAuction({ exercise }: { exercise: PublicAuctionData }) {
  return <section aria-label="Historique public des enchères" className="min-w-0 rounded-xl border border-[var(--border)] p-3">
    <h2 className="font-black">Enchères publiques</h2>
    <p className="mt-1 text-xs text-[var(--text-secondary)]">Lecture depuis ta place : partenaire en face, adversaires à droite et à gauche.</p>
    <ol className="mt-3 flex flex-wrap gap-2">
      {exercise.publicBids.map((bid, index) => <li key={index} aria-current={index === exercise.targetBidIndex ? "step" : undefined}
        className={`min-w-0 rounded-xl border p-2 text-sm ${index === exercise.targetBidIndex ? "border-[var(--accent)] bg-[var(--surface-raised)] ring-2 ring-[var(--accent)]" : "border-[var(--border)]"}`}>
        <span className="block font-bold">{TRAINING_BID_ROLES[bid.playerId]} · {exercise.playerNames[bid.playerId]}</span>
        <span className="block">{formatPublicBidLabel(bid)}{index === exercise.targetBidIndex ? " · annonce à lire" : ""}</span>
      </li>)}
    </ol>
  </section>;
}

export function BidReadingCompatibleHand({ illustrationHand }: { illustrationHand: DoctrineData["illustrationHand"] }) {
  return <section aria-label="Exemple de main compatible" className="mt-4 rounded-xl border border-[var(--border)] p-3">
    <h3 className="font-black">Exemple de main compatible</h3>
    <p className="mt-1 text-sm font-semibold">Une main compatible parmi d’autres</p>
    <p className="mt-1 text-xs text-[var(--text-secondary)]">Voici la main utilisée pour cet exemple. Elle illustre une possibilité, mais l’enchère seule ne révèle pas toutes ces cartes.</p>
    <div className="mt-3 flex flex-wrap gap-1.5">{illustrationHand.map((card) => <span key={cardId(card)}
      aria-label={cardAccessibleName(card)} className="rounded-md border border-[var(--border)] bg-[#fffef9] px-2 py-1 font-bold text-stone-900">
      {card.rank}{SUIT_SYMBOLS[card.suit]}
    </span>)}</div>
  </section>;
}

export function BidReadingDoctrineCorrection({ promise, illustrationHand }: DoctrineData) {
  return <>
    <h2 className="mt-4 font-black">Selon la doctrine de l’application</h2>
    <h3 className="mt-2 font-bold">Tu peux affirmer :</h3>
    {promise.guaranteed.length > 0 ? <ul className="mt-1 list-disc pl-5 text-sm">{promise.guaranteed.map((id) =>
      <li key={id}>{BID_READING_ASSERTION_LABELS[id]}</li>)}</ul> : <p className="mt-1 text-sm">Aucune carte précise n’est garantie par cette annonce.</p>}
    <h3 className="mt-3 font-bold">Cette enchère peut correspondre à :</h3>
    <ul className="mt-1 list-disc pl-5 text-sm">{promise.possibleMeanings.map((meaning) =>
      <li key={meaning}>{BID_READING_MEANING_LABELS[meaning]}</li>)}</ul>
    {promise.explanation.map((line, lineIndex) => <p key={lineIndex} className="mt-2 text-sm text-[var(--text-secondary)]">{line}</p>)}
    <BidReadingCompatibleHand illustrationHand={illustrationHand} />
  </>;
}
