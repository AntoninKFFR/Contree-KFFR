"use client";

import { useState } from "react";
import { AnalysisCardList } from "@/components/BotHandAnalysis";
import { formatCard, SUIT_LABELS } from "@/engine/cards";
import type { BotReviewBundleV2, BotReviewScenarioV1 } from "@/bots/botReview";
import { serializeBotReviewBundle, serializeBotReviewScenario } from "@/bots/botReview";
import type { PlayerId } from "@/engine/types";

type BotReviewPanelProps = {
  scenario: BotReviewScenarioV1;
  onClose: () => void;
  createFullBundle?: (humanComment: string) => BotReviewBundleV2;
};

function formatBid(scenario: BotReviewScenarioV1): string {
  const bid = scenario.chosenBid;
  if (!bid) return "—";
  if (bid.action !== "bid") return bid.action;
  return `${bid.value} ${SUIT_LABELS[bid.trump]}`;
}

export function BotReviewPanel({ scenario, onClose, createFullBundle }: BotReviewPanelProps) {
  const [humanComment, setHumanComment] = useState(scenario.humanComment ?? "");
  const [status, setStatus] = useState("");
  const json = () => serializeBotReviewScenario(scenario, humanComment);

  async function copyScenario() {
    try {
      await navigator.clipboard.writeText(json());
      setStatus("Scénario copié.");
    } catch {
      setStatus("Copie impossible dans ce navigateur.");
    }
  }

  function downloadScenario() {
    const url = URL.createObjectURL(new Blob([json()], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `bot-review-${scenario.decisionId}.json`;
    link.click();
    URL.revokeObjectURL(url);
    setStatus("JSON téléchargé.");
  }

  async function copyFullAnalysis() {
    if (!createFullBundle) return;
    try {
      await navigator.clipboard.writeText(serializeBotReviewBundle(createFullBundle(humanComment)));
      setStatus("Analyse complète copiée.");
    } catch {
      setStatus("Copie impossible dans ce navigateur.");
    }
  }

  function downloadFullAnalysis() {
    if (!createFullBundle) return;
    const bundle = createFullBundle(humanComment);
    const url = URL.createObjectURL(new Blob([serializeBotReviewBundle(bundle)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `bot-analysis-game-${bundle.gameId}-r${bundle.current.roundNumber}.json`;
    link.click();
    URL.revokeObjectURL(url);
    setStatus("Analyse complète téléchargée.");
  }

  const chosen = scenario.chosenCard ? formatCard(scenario.chosenCard) : `Enchère : ${formatBid(scenario)}`;
  const contract = scenario.contract
    ? `${scenario.contract.kind === "capot" ? "capot" : scenario.contract.value} ${SUIT_LABELS[scenario.contract.trump]} (${scenario.contract.status})`
    : "Aucun";
  const trick = scenario.currentTrick.cards.length > 0
    ? scenario.currentTrick.cards.map((played) => `P${played.playerId}: ${formatCard(played.card)}`).join(", ")
    : "Début de pli";
  const biddingTrace = scenario.trace.bidding;
  const v3Trace = biddingTrace && "version" in biddingTrace && biddingTrace.version === 3
    ? biddingTrace
    : null;

  return (
    <aside className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-stone-900 shadow-sm" aria-label="Analyse du dernier coup du bot">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-bold">Review bot · {scenario.decisionId}</p>
          <p className="text-stone-600">Capture locale, sans mains adverses.</p>
        </div>
        <button className="font-semibold text-stone-600 hover:text-stone-950" onClick={onClose} type="button">
          Fermer
        </button>
      </div>

      <section className="mt-3 rounded-lg border-2 border-amber-400 bg-white p-3">
        <h2 className="text-base font-bold">Main du bot avant la décision</h2>
        <p className="mb-3 mt-1 text-sm text-stone-600">
          La carte cerclée est celle que le bot a choisie.
        </p>
        <AnalysisCardList
          cards={scenario.ownHand}
          chosenCard={scenario.chosenCard}
          label="Main complète du bot avant sa décision"
          trump={scenario.trump ?? undefined}
        />
      </section>

      <section className="mt-3 rounded-md border border-stone-300 bg-white/80 p-3">
        <h2 className="text-sm font-bold">Cartes légales</h2>
        {scenario.legalCards.length > 0 ? (
          <div className="mt-2">
            <AnalysisCardList
              cards={scenario.legalCards}
              label="Cartes légales pour cette décision"
              trump={scenario.trump ?? undefined}
            />
          </div>
        ) : (
          <p className="mt-1 text-sm text-stone-600">Sans objet pour une enchère.</p>
        )}
      </section>

      <dl className="mt-3 grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1">
        <dt className="font-semibold">Bot :</dt><dd>P{scenario.playerId} · {scenario.botProfile}</dd>
        <dt className="font-semibold">Carte choisie :</dt><dd>{chosen}</dd>
        <dt className="font-semibold">Atout :</dt><dd>{scenario.trump ? SUIT_LABELS[scenario.trump] : "Aucun"}</dd>
        <dt className="font-semibold">Contrat :</dt><dd>{contract}</dd>
        <dt className="font-semibold">Pli :</dt><dd>{trick}</dd>
        <dt className="font-semibold">Stratégie :</dt><dd>{scenario.decisionEngine}</dd>
        <dt className="font-semibold">Temps :</dt><dd>{scenario.elapsedMs.toFixed(2)} ms</dd>
      </dl>

      {v3Trace ? (
        <section className="mt-3 rounded-md border border-amber-300 bg-white/80 p-3">
          <h2 className="text-sm font-bold">Conversation d’enchères V3</h2>
          <dl className="mt-2 grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1">
            <dt className="font-semibold">Message partenaire :</dt>
            <dd>{v3Trace.partnerMessage ? `${v3Trace.partnerMessage.value} ${SUIT_LABELS[v3Trace.partnerMessage.trump]}` : "Aucun"}</dd>
            <dt className="font-semibold">Fit partenaire :</dt><dd>{v3Trace.partnerFit}</dd>
            <dt className="font-semibold">Fondation atout :</dt><dd>{v3Trace.trumpFoundation}</dd>
            <dt className="font-semibold">Couleur candidate :</dt><dd>{SUIT_LABELS[v3Trace.candidateSuit]}</dd>
            <dt className="font-semibold">Couleur partenaire :</dt><dd>{v3Trace.partnerSuit ? SUIT_LABELS[v3Trace.partnerSuit] : "Aucune"}</dd>
            <dt className="font-semibold">Override :</dt><dd>{v3Trace.partnerSuitOverride}</dd>
            <dt className="font-semibold">Palier minimal :</dt><dd>{v3Trace.minimalUsefulBid ?? "Aucun"}</dd>
            <dt className="font-semibold">Plafond intrinsèque :</dt><dd>{v3Trace.intrinsicCeiling ?? "Aucun"}</dd>
            <dt className="font-semibold">Plafond de rebid :</dt><dd>{v3Trace.rebidCeiling ?? "Aucun"}</dd>
            <dt className="font-semibold">Intention :</dt><dd>{v3Trace.communicationIntent}</dd>
            <dt className="font-semibold">Raison :</dt><dd>{v3Trace.reason}</dd>
          </dl>
        </section>
      ) : null}

      <label className="mt-3 block font-semibold" htmlFor="bot-review-comment">
        Pourquoi ce coup est mauvais ?
      </label>
      <textarea
        className="mt-1 min-h-16 w-full rounded-md border border-stone-300 bg-white p-2"
        id="bot-review-comment"
        onChange={(event) => setHumanComment(event.target.value)}
        placeholder="Le partenaire est déjà maître, il ne faut pas mettre le 10."
        value={humanComment}
      />

      <div className="mt-3 flex flex-wrap gap-2">
        <button className="rounded-md bg-stone-900 px-3 py-2 font-semibold text-white" onClick={copyScenario} type="button">
          Copier le scénario
        </button>
        <button className="rounded-md border border-stone-400 bg-white px-3 py-2 font-semibold" onClick={downloadScenario} type="button">
          Télécharger JSON
        </button>
        {createFullBundle ? (
          <>
            <button className="rounded-md bg-amber-700 px-3 py-2 font-semibold text-white" onClick={downloadFullAnalysis} type="button">
              Télécharger analyse complète
            </button>
            <button className="rounded-md border border-amber-600 bg-white px-3 py-2 font-semibold" onClick={copyFullAnalysis} type="button">
              Copier analyse complète
            </button>
          </>
        ) : null}
      </div>
      {status ? <p className="mt-2 text-stone-600" role="status">{status}</p> : null}
    </aside>
  );
}

function decisionLabel(scenario: BotReviewScenarioV1): string {
  if (scenario.chosenCard) return formatCard(scenario.chosenCard);
  const bid = scenario.chosenBid;
  if (!bid) return "Décision inconnue";
  if (bid.action === "bid") return `${bid.value}${SUIT_LABELS[bid.trump]}`;
  if (bid.action === "coinche") return "Coinche";
  if (bid.action === "surcoinche") return "Surcoinche";
  return "Passe";
}

export function BotReviewHistory({
  decisions,
  playerNames,
  selectedDecisionId,
  onSelect,
}: {
  decisions: BotReviewScenarioV1[];
  playerNames?: Record<PlayerId, string>;
  selectedDecisionId: string | null;
  onSelect: (scenario: BotReviewScenarioV1) => void;
}) {
  const recentDecisions = decisions.slice(-20).reverse();
  return (
    <section className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-stone-900" aria-label="Historique des décisions bots">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-bold">Historique des décisions</h2>
        <span className="text-stone-600">{decisions.length} conservée{decisions.length > 1 ? "s" : ""}</span>
      </div>
      <div className="mt-2 max-h-48 space-y-1 overflow-y-auto">
        {recentDecisions.map((scenario, index) => {
          const decisionNumber = decisions.length - index;
          const isSelected = scenario.decisionId === selectedDecisionId;
          return (
            <button
              className={`block w-full rounded px-2 py-1.5 text-left ${isSelected ? "bg-amber-200 font-bold" : "bg-white hover:bg-amber-100"}`}
              key={scenario.decisionId}
              onClick={() => onSelect(scenario)}
              type="button"
            >
              D{decisionNumber} · {playerNames?.[scenario.playerId] ?? `P${scenario.playerId}`} · {decisionLabel(scenario)}
            </button>
          );
        })}
      </div>
    </section>
  );
}
