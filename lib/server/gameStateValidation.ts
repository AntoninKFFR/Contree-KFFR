import "server-only";
import { cardId } from "@/engine/cards";
import type { Card, ContractMode, GameState, PlayerId, Rank, Suit, Trick } from "@/engine/types";
import { normalizeGameSettings } from "@/engine/rulesets/resolve";
import { resolveContractMode } from "@/engine/contractMode";
import { inactivePlayerIdForContract, nextActivePlayer } from "@/engine/activePlayers";
import { canBidGeneraleMode } from "@/engine/bidding";
import { playerTeam } from "@/engine/rules";

const SUITS = new Set<Suit>(["clubs", "diamonds", "hearts", "spades"]);
const RANKS = new Set<Rank>(["7", "8", "9", "J", "Q", "K", "10", "A"]);
const PHASES = new Set(["bidding", "playing", "finished", "game-over"]);
const CONTRACT_KINDS = new Set(["points", "capot", "generale"]);
const CONTRACT_STATUSES = new Set(["normal", "coinched", "surcoinched"]);

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function card(value: unknown): value is Card {
  return object(value) && SUITS.has(value.suit as Suit) && RANKS.has(value.rank as Rank);
}

function playerId(value: unknown): value is PlayerId {
  return value === 0 || value === 1 || value === 2 || value === 3;
}

function teamId(value: unknown): value is 0 | 1 {
  return value === 0 || value === 1;
}

function validContract(value: unknown): boolean {
  if (!object(value) || !playerId(value.playerId) || !teamId(value.teamId)) return false;
  if (value.kind !== undefined && !CONTRACT_KINDS.has(String(value.kind))) return false;
  if (!CONTRACT_STATUSES.has(String(value.status))) return false;
  if (typeof value.value !== "number" || !Number.isFinite(value.value) || !Number.isInteger(value.value) || value.value < 0) return false;
  if (value.trump !== undefined && !SUITS.has(value.trump as Suit)) return false;
  if (value.coinchedBy !== undefined && !playerId(value.coinchedBy)) return false;
  if (value.surcoinchedBy !== undefined && !playerId(value.surcoinchedBy)) return false;
  if (value.contractMode !== undefined) {
    if (!object(value.contractMode)) return false;
    if (value.contractMode.kind === "suit") return SUITS.has(value.contractMode.suit as Suit);
    if (value.contractMode.kind !== "no-trump" && value.contractMode.kind !== "all-trump") return false;
  }
  return true;
}

function sameContractMode(left: ContractMode, right: ContractMode): boolean {
  return left.kind === right.kind && (left.kind !== "suit" || (right.kind === "suit" && left.suit === right.suit));
}

function scoreRecord(value: unknown): boolean {
  return object(value) && [value[0], value[1]].every((score) => typeof score === "number" && Number.isFinite(score) && Number.isInteger(score) && score >= 0);
}

function playedCards(value: unknown): value is Trick["cards"] {
  return Array.isArray(value) && value.every((played) => object(played) && playerId(played.playerId) && card(played.card));
}

function validTrick(value: unknown, completed: boolean): value is Trick & { winnerId?: PlayerId; points?: number } {
  if (!object(value) || !playerId(value.leaderId) || !playedCards(value.cards)) return false;
  if (new Set(value.cards.map((played) => played.playerId)).size !== value.cards.length) return false;
  if (!completed) return true;
  return playerId(value.winnerId) && typeof value.points === "number" && Number.isFinite(value.points) && Number.isInteger(value.points) && value.points >= 0;
}

export function parseServerGameState(value: unknown): GameState {
  if (!object(value) || !PHASES.has(String(value.phase)) || !playerId(value.currentPlayerId)) {
    throw new Error("Stored game state is invalid.");
  }
  if (!object(value.hands)) throw new Error("Stored game hands are invalid.");
  if (value.contract !== null && value.contract !== undefined && !validContract(value.contract)) {
    throw new Error("Stored contract is invalid.");
  }
  if (value.endReason !== undefined && value.endReason !== null && value.endReason !== "score" && value.endReason !== "forfeit") {
    throw new Error("Stored game end reason is invalid.");
  }
  if (
    value.forfeitingTeam !== undefined &&
    value.forfeitingTeam !== null &&
    value.forfeitingTeam !== 0 &&
    value.forfeitingTeam !== 1
  ) {
    throw new Error("Stored forfeiting team is invalid.");
  }
  if (
    value.endReason === "forfeit" &&
    (
      value.phase !== "game-over" ||
      value.forfeitingTeam === null ||
      value.forfeitingTeam === undefined ||
      (value.forfeitingTeam === 0 && value.winnerTeam !== 1) ||
      (value.forfeitingTeam === 1 && value.winnerTeam !== 0)
    )
  ) {
    throw new Error("Stored forfeit state is inconsistent.");
  }
  for (const seat of [0, 1, 2, 3] as const) {
    const hand = value.hands[seat];
    if (!Array.isArray(hand) || !hand.every(card)) {
      throw new Error(`Stored hand ${seat} is invalid.`);
    }
  }
  if (!Array.isArray(value.bids) || !Array.isArray(value.completedTricks) || !validTrick(value.currentTrick, false) || !value.completedTricks.every((trick) => validTrick(trick, true))) {
    throw new Error("Stored trick history is invalid.");
  }
  if (![value.totalScore, value.roundScore, value.trickPoints].every(scoreRecord)) {
    throw new Error("Stored game score is invalid.");
  }
  if (!object(value.settings)) throw new Error("Stored game settings are invalid.");
  const state = value as GameState;
  const contractMode = resolveContractMode(state);
  const normalized: GameState = {
    ...state,
    ...(contractMode ? { contractMode } : {}),
    contract: state.contract && resolveContractMode(state.contract)
      ? { ...state.contract, contractMode: resolveContractMode(state.contract)! }
      : state.contract,
    settings: normalizeGameSettings(value.settings),
  };
  const inactive = inactivePlayerIdForContract(normalized.contract);
  const rules = normalized.settings.ruleset!;
  const contract = normalized.contract;
  if (contract) {
    const mode = resolveContractMode(contract);
    const publicMode = resolveContractMode(normalized);
    const allowedMode = mode?.kind === "suit" || (mode?.kind === "no-trump" && rules.bidding.allowNoTrump) || (mode?.kind === "all-trump" && rules.bidding.allowAllTrump);
    const pointsContractAllowed = contract.kind === undefined || contract.kind === "points"
      ? contract.value >= rules.bidding.minBid && contract.value <= rules.bidding.maxBid && (contract.value - rules.bidding.minBid) % rules.bidding.bidStep === 0
      : true;
    if (!mode || !allowedMode || !pointsContractAllowed || contract.teamId !== playerTeam(contract.playerId)) {
      throw new Error("Stored contract mode is inconsistent with its ruleset.");
    }
    if ((publicMode && !sameContractMode(publicMode, mode)) || (normalized.trump && (mode.kind !== "suit" || normalized.trump !== mode.suit))) {
      throw new Error("Stored state and contract modes are inconsistent.");
    }
    if (!publicMode) normalized.contractMode = mode;
    if ((contract.kind === "capot" && !rules.bidding.allowCapot) || (contract.status === "coinched" && !rules.bidding.allowCoinche) || (contract.status === "surcoinched" && (!rules.bidding.allowCoinche || !rules.bidding.allowSurcoinche))) {
      throw new Error("Stored contract is not allowed by its ruleset.");
    }
  }
  const expectedTrickSize = inactive === null ? 4 : 3;
  if (normalized.completedTricks.some((trick) => trick.cards.length !== expectedTrickSize) || normalized.currentTrick.cards.length > expectedTrickSize) {
    throw new Error("Stored trick size is invalid.");
  }
  const allCards = [
    ...([0, 1, 2, 3] as const).flatMap((seat) => normalized.hands[seat]),
    ...normalized.completedTricks.flatMap((trick) => trick.cards.map((played) => played.card)),
    ...normalized.currentTrick.cards.map((played) => played.card),
  ];
  if (allCards.length !== 32 || new Set(allCards.map(cardId)).size !== 32) {
    throw new Error("Stored game contains a duplicated card or an incomplete deck.");
  }
  if (normalized.phase === "playing") {
    const lastPlayed = normalized.currentTrick.cards.at(-1);
    const expectedPlayer = lastPlayed ? nextActivePlayer(normalized, lastPlayed.playerId) : normalized.currentTrick.leaderId;
    if (normalized.currentPlayerId !== expectedPlayer) throw new Error("Stored current player is inconsistent with trick order.");
  }
  if (normalized.contract?.kind === "generale") {
    const mode = resolveContractMode(normalized.contract);
    if (!playerId(normalized.contract.playerId) || !rules.bidding.allowGenerale || !mode || !canBidGeneraleMode(mode, rules.bidding)) {
      throw new Error("Stored Generale is not allowed by its ruleset.");
    }
    if (normalized.contract.value !== rules.scoring.generaleBasePoints || normalized.bids.some((bid) => bid.action === "generale" && bid.value !== rules.scoring.generaleBasePoints)) {
      throw new Error("Stored Generale value does not match its ruleset.");
    }
    if (inactive === null || normalized.hands[inactive].length !== 8) {
      throw new Error("Stored Generale inactive hand is invalid.");
    }
    const tricks = [...normalized.completedTricks, normalized.currentTrick];
    if (tricks.some((trick) => trick.leaderId === inactive || trick.cards.some((played) => played.playerId === inactive))) {
      throw new Error("Stored Generale contains a card from the inactive partner.");
    }
    if (normalized.completedTricks.some((trick) => trick.winnerId === inactive) || normalized.completedTricks.length > 8) {
      throw new Error("Stored Generale winner history is invalid.");
    }
    if (normalized.completedTricks.some((trick) => trick.cards.length !== 3) || normalized.currentTrick.cards.length > 3) {
      throw new Error("Stored Generale trick size is invalid.");
    }
    if (normalized.phase === "playing" && normalized.currentPlayerId === inactive) {
      throw new Error("Stored Generale waits on the inactive partner.");
    }
  }
  return normalized;
}
