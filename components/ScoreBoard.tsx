import { SUIT_LABELS, SUIT_SYMBOLS } from "@/engine/cards";
import { playerName, teamName } from "@/engine/players";
import type { ContractStatus, GameState } from "@/engine/types";

type ScoreBoardProps = {
  state: GameState;
  onNewGame: () => void;
  onNextRound: () => void;
};

export function ScoreBoard({ state, onNewGame, onNextRound }: ScoreBoardProps) {
  const displayedContract = state.contract;
  const canStartNextRound = state.phase === "finished";
  const nameFor = (playerId: Parameters<typeof playerName>[0]) =>
    playerName(playerId, state.playerNames);
  const teamFor = (teamId: Parameters<typeof teamName>[0]) => teamName(teamId, state.playerNames);

  return (
    <aside className="hidden min-h-0 rounded-lg border border-stone-200 bg-white/95 p-3 text-sm shadow-sm lg:flex lg:flex-col lg:overflow-hidden">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-stone-500">Atout</p>
          {state.trump ? (
            <p className="text-xl font-bold">
              {SUIT_LABELS[state.trump]} {SUIT_SYMBOLS[state.trump]}
            </p>
          ) : (
            <p className="text-xl font-bold">A choisir</p>
          )}
        </div>
        <button
          className="rounded-md bg-stone-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-stone-700"
          onClick={canStartNextRound ? onNextRound : onNewGame}
          type="button"
        >
          {canStartNextRound ? "Manche suivante" : "Nouvelle partie"}
        </button>
      </div>

      {state.phase === "game-over" ? (
        <div className="mt-2 rounded-md bg-emerald-100 p-2 text-xs text-stone-800">
          <p className="font-semibold">Partie terminée</p>
          {state.winnerTeam !== null ? <p>{teamFor(state.winnerTeam)} gagnent la partie.</p> : null}
        </div>
      ) : null}

      <div className="mt-2 grid grid-cols-2 gap-2">
        <div className="rounded-md bg-stone-100 p-2 text-stone-700">
          <p className="text-xs font-semibold">Score total</p>
          <div className="mt-1 grid grid-cols-2 gap-2">
            <div>
              <p className="text-xs text-stone-500">{teamFor(0)}</p>
              <p className="text-xl font-bold">{state.totalScore[0]}</p>
            </div>
            <div>
              <p className="text-xs text-stone-500">{teamFor(1)}</p>
              <p className="text-xl font-bold">{state.totalScore[1]}</p>
            </div>
          </div>
          <p className="mt-1 text-xs text-stone-500">Cible: {state.settings.targetScore}</p>
        </div>
        <div className="grid grid-rows-2 gap-2">
          <ScoreTile label={`Manche ${teamFor(0)}`} value={state.trickPoints[0]} tone="green" />
          <ScoreTile label={`Manche ${teamFor(1)}`} value={state.trickPoints[1]} tone="yellow" />
        </div>
      </div>

      <div className="mt-2 rounded-md bg-stone-100 p-2 text-xs text-stone-700">
        <p className="font-semibold">Contrat</p>
        {displayedContract ? (
          <p>
            {displayedContract.value} a {SUIT_LABELS[displayedContract.trump]}{" "}
            {SUIT_SYMBOLS[displayedContract.trump]} par {nameFor(displayedContract.playerId)} -{" "}
            {contractStatusLabel(displayedContract.status)}
          </p>
        ) : (
          <p>Aucun contrat final pour l&apos;instant.</p>
        )}
      </div>

      {state.result?.kind === "played" ? (
        <div className="mt-2 rounded-md bg-emerald-50 p-2 text-xs text-stone-700">
          <p className="font-semibold">
            {state.result.contractSucceeded ? "Contrat reussi" : "Contrat chute"}
          </p>
          <p>
            Preneurs: {state.result.takerPoints}, defense: {state.result.defenderPoints}, x
            {state.result.multiplier}.
          </p>
        </div>
      ) : null}

      <p className="mt-2 rounded-md bg-stone-900 px-2 py-2 text-xs font-semibold text-white">
        {state.message}
      </p>

      <div className="mt-2 min-h-0 flex-1 space-y-2 overflow-hidden">
        <details className="rounded-md bg-stone-100 p-2 text-xs text-stone-700" open>
          <summary className="cursor-pointer font-semibold">Historique</summary>
          {state.roundHistory.length === 0 ? (
            <p className="mt-1">Aucune manche terminee.</p>
          ) : (
            <ul className="mt-1 space-y-1">
              {state.roundHistory.slice(-4).map((entry) => (
                <li key={entry.roundNumber}>
                  Manche {entry.roundNumber}: {entry.result.roundScore[0]} -{" "}
                  {entry.result.roundScore[1]} | Total {entry.totalScoreAfterRound[0]} -{" "}
                  {entry.totalScoreAfterRound[1]}
                </li>
              ))}
            </ul>
          )}
        </details>

        <details className="rounded-md bg-stone-100 p-2 text-xs text-stone-700" open>
          <summary className="cursor-pointer font-semibold">Annonces</summary>
          {state.bids.length === 0 ? (
            <p className="mt-1">Aucune annonce.</p>
          ) : (
            <ul className="mt-1 space-y-1">
              {state.bids.map((bid, index) => (
                <li key={`${bid.playerId}-${index}`}>
                  {nameFor(bid.playerId)}:{" "}
                  {bid.action === "pass"
                    ? "passe"
                    : bid.action === "bid"
                      ? `${bid.value} a ${SUIT_LABELS[bid.trump]} ${SUIT_SYMBOLS[bid.trump]}`
                      : bid.action === "coinche"
                        ? "contre"
                        : "surcontre"}
                </li>
              ))}
            </ul>
          )}
        </details>
      </div>
    </aside>
  );
}

function ScoreTile({
  label,
  tone,
  value,
}: {
  label: string;
  tone: "green" | "yellow";
  value: number;
}) {
  const toneClass = tone === "green" ? "bg-emerald-50" : "bg-yellow-50";

  return (
    <div className={`${toneClass} rounded-md p-2`}>
      <p className="text-[11px] leading-tight text-stone-600">{label}</p>
      <p className="text-lg font-bold leading-none">{value}</p>
    </div>
  );
}

function contractStatusLabel(status: ContractStatus): string {
  if (status === "coinched") return "contré";
  if (status === "surcoinched") return "surcontré";
  return "normal";
}
