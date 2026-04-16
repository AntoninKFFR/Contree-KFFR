import { SUIT_LABELS, SUIT_SYMBOLS } from "@/engine/cards";
import { playerName } from "@/engine/players";
import type { ContractStatus, GameState, ScoringMode } from "@/engine/types";

type ScoreBoardProps = {
  state: GameState;
  onNewGame: () => void;
};

export function ScoreBoard({ state, onNewGame }: ScoreBoardProps) {
  const displayedContract = state.contract;

  return (
    <aside className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm uppercase tracking-wide text-stone-500">Atout</p>
          {state.trump ? (
            <p className="text-2xl font-bold">
              {SUIT_LABELS[state.trump]} {SUIT_SYMBOLS[state.trump]}
            </p>
          ) : (
            <p className="text-2xl font-bold">A choisir</p>
          )}
        </div>
        <button
          className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-semibold text-white hover:bg-stone-700"
          onClick={onNewGame}
          type="button"
        >
          Nouvelle partie
        </button>
      </div>

      <div className="mt-4 rounded-lg bg-stone-100 p-3 text-sm text-stone-700">
        <p className="font-semibold">Contrat</p>
        {displayedContract ? (
          <p>
            {displayedContract.value} a {SUIT_LABELS[displayedContract.trump]}{" "}
            {SUIT_SYMBOLS[displayedContract.trump]} par {playerName(displayedContract.playerId)} -{" "}
            {contractStatusLabel(displayedContract.status)}
          </p>
        ) : (
          <p>Aucun contrat final pour l&apos;instant.</p>
        )}
      </div>

      <div className="mt-4 rounded-lg bg-stone-100 p-3 text-sm text-stone-700">
        <p className="font-semibold">Mode de score</p>
        <p>{scoringModeLabel(state.settings.scoringMode)}</p>
      </div>

      <div className="mt-4 rounded-lg bg-stone-100 p-3 text-sm text-stone-700">
        <p className="font-semibold">Annonces</p>
        {state.bids.length === 0 ? (
          <p>Aucune annonce.</p>
        ) : (
          <ul className="mt-2 space-y-1">
            {state.bids.map((bid, index) => (
              <li key={`${bid.playerId}-${index}`}>
                {playerName(bid.playerId)}:{" "}
                {bid.action === "pass"
                  ? "passe"
                  : bid.action === "bid"
                    ? `${bid.value} a ${SUIT_LABELS[bid.trump]} ${SUIT_SYMBOLS[bid.trump]}`
                    : bid.action === "coinche"
                      ? "coinche"
                      : "surcoinche"}
              </li>
            ))}
          </ul>
        )}
      </div>

      {state.result?.kind === "played" ? (
        <div className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm text-stone-700">
          <p className="font-semibold">
            {state.result.contractSucceeded ? "Contrat reussi" : "Contrat chute"}
          </p>
          <p>
            Preneurs: {state.result.takerPoints} points, defense: {state.result.defenderPoints}{" "}
            points. Multiplicateur: x{state.result.multiplier}.
          </p>
        </div>
      ) : null}

      <div className="mt-5 grid grid-cols-2 gap-3">
        <div className="rounded-lg bg-emerald-50 p-3">
          <p className="text-sm text-stone-600">Equipe Anto + Boulais</p>
          <p className="text-3xl font-bold">{state.trickPoints[0]}</p>
        </div>
        <div className="rounded-lg bg-yellow-50 p-3">
          <p className="text-sm text-stone-600">Equipe Max + Allan</p>
          <p className="text-3xl font-bold">{state.trickPoints[1]}</p>
        </div>
      </div>

      <p className="mt-4 rounded-lg bg-stone-100 p-3 text-sm text-stone-700">{state.message}</p>
    </aside>
  );
}

function contractStatusLabel(status: ContractStatus): string {
  if (status === "coinched") return "coinche";
  if (status === "surcoinched") return "surcoinche";
  return "normal";
}

function scoringModeLabel(mode: ScoringMode): string {
  return mode === "announced-points" ? "Points annonces" : "Points faits";
}
