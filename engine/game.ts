import {
  createDeck,
  formatCard,
  sameCard,
  shuffleDeck,
  sortHand,
} from "./cards";
import { formatContractMode, legacyTrump, resolveContractMode } from "./contractMode";
import { declareAnnouncementsForPlayer, emptyAnnouncementState } from "./announcements";
import { emptyBeloteState, playBeloteCard } from "./belote";
import { canBidCapot, canCoinche, canSurcoinche, isAllowedBidValue } from "./bidding";
import { createRandomPlayerNames, playerName, teamName } from "./players";
import {
  getLegalCards,
  getTrickWinner,
  isLegalCard,
  nextPlayer,
  playerTeam,
  trickPoints,
} from "./rules";
import { scoreRound } from "./scoring";
import { normalizeGameSettings, resolveGameRules } from "./rulesets/resolve";
import type {
  Bid,
  BidValue,
  Card,
  Contract,
  ContractMode,
  GameSettings,
  GameState,
  PlayerId,
  Suit,
  TeamId,
} from "./types";

type PlayerNames = Record<PlayerId, string>;

function emptyScore(): Record<TeamId, number> {
  return { 0: 0, 1: 0 };
}

function randomPlayer(random: () => number): PlayerId {
  return Math.floor(random() * 4) as PlayerId;
}

function nextStartingPlayer(playerId: PlayerId): PlayerId {
  return nextPlayer(playerId);
}

function dealHands(deck: Card[]): GameState["hands"] {
  return {
    0: sortHand(deck.slice(0, 8)),
    1: sortHand(deck.slice(8, 16)),
    2: sortHand(deck.slice(16, 24)),
    3: sortHand(deck.slice(24, 32)),
  };
}

export function createInitialGame(
  random = Math.random,
  settings: Partial<GameSettings> = {},
): GameState {
  const startingPlayerId = randomPlayer(random);

  return createRoundState({
    random,
    settings: normalizeGameSettings(settings),
    playerNames: createRandomPlayerNames(random),
    roundHistory: [],
    roundNumber: 1,
    startingPlayerId,
    totalScore: emptyScore(),
    winnerTeam: null,
  });
}

function createRoundState({
  random,
  roundHistory,
  roundNumber,
  settings,
  playerNames,
  startingPlayerId,
  totalScore,
  winnerTeam,
}: {
  random: () => number;
  roundHistory: GameState["roundHistory"];
  roundNumber: number;
  settings: GameSettings;
  playerNames: PlayerNames;
  startingPlayerId: PlayerId;
  totalScore: Record<TeamId, number>;
  winnerTeam: TeamId | null;
}): GameState {
  const deck = shuffleDeck(createDeck(), random);

  return {
    settings,
    playerNames,
    phase: "bidding",
    roundNumber,
    startingPlayerId,
    totalScore,
    roundHistory,
    winnerTeam,
    endReason: null,
    forfeitingTeam: null,
    trump: null,
    hands: dealHands(deck),
    currentPlayerId: startingPlayerId,
    currentTrick: {
      leaderId: startingPlayerId,
      cards: [],
    },
    completedTricks: [],
    bids: [],
    contract: null,
    result: null,
    trickPoints: emptyScore(),
    announcements: emptyAnnouncementState(),
    belote: emptyBeloteState(),
    roundScore: emptyScore(),
    message: `Manche ${roundNumber}: phase d'annonces, ${playerName(startingPlayerId, playerNames)} commence.`,
  };
}

function addScores(
  first: Record<TeamId, number>,
  second: Record<TeamId, number>,
): Record<TeamId, number> {
  return {
    0: first[0] + second[0],
    1: first[1] + second[1],
  };
}

function winningTeam(totalScore: Record<TeamId, number>, targetScore: number): TeamId | null {
  if (totalScore[0] === totalScore[1]) return null;
  if (totalScore[0] >= targetScore && totalScore[0] > totalScore[1]) return 0;
  if (totalScore[1] >= targetScore && totalScore[1] > totalScore[0]) return 1;
  return null;
}

function reachesTargetOnlyThroughBelote(
  state: GameState,
  result: Extract<NonNullable<GameState["result"]>, { kind: "played" }>,
  teamId: TeamId,
): boolean {
  const rules = resolveGameRules(state.settings);
  if (rules.scoring.mode !== "ffb" || result.belotePointsByTeam[teamId] === 0) {
    return false;
  }
  const sufferedCapot = result.capotTeam !== null && result.capotTeam !== teamId;
  const fellContract = result.contract.teamId === teamId && !result.contractSucceeded;
  if (!sufferedCapot && !fellContract) return false;

  const tricksWonByTeam: Record<TeamId, number> = result.capotTeam === 0
    ? { 0: 8, 1: 0 }
    : result.capotTeam === 1
      ? { 0: 0, 1: 8 }
      : { 0: 0, 1: 0 };
  const withoutBelote = scoreRound({
    contract: result.contract,
    settings: state.settings,
    rules,
    trickPointsByTeam: result.trickPointsByTeam,
    tricksWonByTeam,
    belotePointsByTeam: { 0: 0, 1: 0 },
  });
  return state.totalScore[teamId] + withoutBelote.roundScore[teamId] < rules.game.targetScore;
}

function finishRound(state: GameState, result: GameState["result"], baseMessage: string): GameState {
  if (!result) {
    return state;
  }

  const totalScore = addScores(state.totalScore, result.roundScore);
  const rules = resolveGameRules(state.settings);
  let winnerTeam = winningTeam(totalScore, rules.game.targetScore);
  if (
    winnerTeam !== null
    && result.kind === "played"
    && reachesTargetOnlyThroughBelote(state, result, winnerTeam)
  ) {
    winnerTeam = null;
  }
  const roundHistory = [
    ...state.roundHistory,
    {
      roundNumber: state.roundNumber,
      result,
      totalScoreAfterRound: totalScore,
    },
  ];

  return {
    ...state,
    phase: winnerTeam === null ? "finished" : "game-over",
    result,
    roundScore: result.roundScore,
    totalScore,
    roundHistory,
    winnerTeam,
    endReason: winnerTeam === null ? null : "score",
    forfeitingTeam: null,
    message:
      winnerTeam === null
        ? `${baseMessage} Lance la manche suivante.`
        : `${baseMessage} Partie terminée: ${teamName(winnerTeam, state.playerNames)} gagnent la partie.`,
  };
}

export function endGameByForfeit(state: GameState, forfeitingTeam: TeamId): GameState {
  const winnerTeam: TeamId = forfeitingTeam === 0 ? 1 : 0;
  return {
    ...state,
    phase: "game-over",
    winnerTeam,
    endReason: "forfeit",
    forfeitingTeam,
    message: `${teamName(winnerTeam, state.playerNames)} gagnent par abandon.`,
  };
}

function sortHandsForTrump(hands: GameState["hands"], trump: Suit | null): GameState["hands"] {
  return {
    0: sortHand(hands[0], trump ?? undefined),
    1: sortHand(hands[1], trump ?? undefined),
    2: sortHand(hands[2], trump ?? undefined),
    3: sortHand(hands[3], trump ?? undefined),
  };
}

function currentHighestBid(bids: Bid[]): Contract | null {
  let contract: Contract | null = null;

  for (const bid of bids) {
    if (bid.action === "bid") {
      const contractMode = resolveContractMode(bid);
      if (!contractMode) continue;
      contract = {
        kind: "points",
        playerId: bid.playerId,
        teamId: playerTeam(bid.playerId),
        value: bid.value,
        ...(legacyTrump(contractMode) ? { trump: legacyTrump(contractMode)! } : {}),
        contractMode,
        status: "normal",
      };
    }

    if (bid.action === "capot") {
      const contractMode = resolveContractMode(bid);
      if (!contractMode) continue;
      contract = {
        kind: "capot",
        playerId: bid.playerId,
        teamId: playerTeam(bid.playerId),
        value: 250,
        ...(legacyTrump(contractMode) ? { trump: legacyTrump(contractMode)! } : {}),
        contractMode,
        status: "normal",
      };
    }

    if (bid.action === "coinche" && contract) {
      contract = {
        ...contract,
        status: "coinched",
        coinchedBy: bid.playerId,
        surcoinchedBy: undefined,
      };
    }

    if (bid.action === "surcoinche" && contract) {
      contract = {
        ...contract,
        status: "surcoinched",
        surcoinchedBy: bid.playerId,
      };
    }
  }

  return contract;
}

function isHigherBid(value: BidValue, currentContract: Contract | null): boolean {
  return !currentContract || (currentContract.kind !== "capot" && value > currentContract.value);
}

function isAllPassWithoutContract(bids: Bid[]): boolean {
  return bids.length === 4 && bids.every((bid) => bid.action === "pass");
}

function hasThreePassesAfterLastContractAction(bids: Bid[]): boolean {
  const lastActionIndex = bids.findLastIndex(
    (bid) => bid.action === "bid" || bid.action === "capot" || bid.action === "coinche",
  );
  if (lastActionIndex < 0) return false;
  const following = bids.slice(lastActionIndex + 1);
  return following.length === 3 && following.every((bid) => bid.action === "pass");
}

function finishBidding(state: GameState, bids: Bid[]): GameState {
  const contract = currentHighestBid(bids);

  if (!contract) {
    const roundScore = { 0: 0, 1: 0 } as Record<TeamId, number>;
    return finishRound(
      {
        ...state,
        bids,
      },
      {
        kind: "all-pass",
        roundScore,
      },
      "Tout le monde passe.",
    );
  }

  return {
    ...state,
    phase: "playing",
    bids,
    contract,
    trump: legacyTrump(contract.contractMode!),
    contractMode: contract.contractMode,
    hands: sortHandsForTrump(state.hands, legacyTrump(contract.contractMode!)),
    currentPlayerId: state.startingPlayerId,
    currentTrick: {
      leaderId: state.startingPlayerId,
      cards: [],
    },
    announcements: emptyAnnouncementState(),
    belote: emptyBeloteState(),
    message: `${playerName(contract.playerId, state.playerNames)} prend ${contract.kind === "capot" ? "capot" : `a ${contract.value}`}. ${playerName(state.startingPlayerId, state.playerNames)} entame.`,
  };
}

export function makeBid(
  state: GameState,
  playerId: PlayerId,
  bid:
    | {
        action: "pass";
      }
    | {
        action: "bid";
        value: BidValue;
        trump?: Suit;
        contractMode?: ContractMode;
      }
    | {
        action: "capot";
        trump?: Suit;
        contractMode?: ContractMode;
      }
    | {
        action: "coinche";
      }
    | {
        action: "surcoinche";
      },
): GameState {
  if (state.phase !== "bidding") {
    throw new Error("Bids are only allowed during the bidding phase.");
  }

  if (state.currentPlayerId !== playerId) {
    throw new Error(`It is player ${state.currentPlayerId}'s bid turn, not player ${playerId}.`);
  }

  const rules = resolveGameRules(state.settings);
  const currentContract = currentHighestBid(state.bids);
  const bidMode = bid.action === "bid" || bid.action === "capot"
    ? resolveContractMode(bid)
    : null;
  if ((bid.action === "bid" || bid.action === "capot") && !bidMode) {
    throw new Error("A contract mode is required.");
  }
  if (bidMode?.kind === "no-trump" && !rules.bidding.allowNoTrump) {
    throw new Error("No-trump contracts are not allowed.");
  }
  if (bidMode?.kind === "all-trump" && !rules.bidding.allowAllTrump) {
    throw new Error("All-trump contracts are not allowed.");
  }

  if ((bid.action === "bid" || bid.action === "capot") && currentContract && currentContract.status !== "normal") {
    throw new Error("A normal bid is not allowed after a contract has been countered.");
  }

  if (bid.action === "bid" && !isAllowedBidValue(bid.value, rules.bidding)) {
    throw new Error("This bid value is not allowed.");
  }

  if (bid.action === "bid" && !isHigherBid(bid.value, currentContract)) {
    throw new Error("A new bid must be higher than the current contract.");
  }

  if (bid.action === "capot" && !canBidCapot(currentContract, rules.bidding)) {
    throw new Error("A capot bid is not allowed over the current contract.");
  }

  if (bid.action === "coinche" && !canCoinche(playerId, currentContract, rules.bidding)) {
    throw new Error("This player cannot coinche the current contract.");
  }

  if (bid.action === "surcoinche" && !canSurcoinche(playerId, currentContract, rules.bidding)) {
    throw new Error("This player cannot surcoinche the current contract.");
  }

  const normalizedBid: Bid = bid.action === "bid" || bid.action === "capot"
    ? {
        playerId,
        ...bid,
        ...(bid.contractMode || bidMode?.kind !== "suit" ? { contractMode: bidMode! } : {}),
      }
    : { playerId, ...bid };
  const nextBids: Bid[] = [...state.bids, normalizedBid];

  const next = nextPlayer(playerId);

  if (
    isAllPassWithoutContract(nextBids) ||
    bid.action === "surcoinche" ||
    hasThreePassesAfterLastContractAction(nextBids)
  ) {
    return finishBidding(state, nextBids);
  }

  return {
    ...state,
    bids: nextBids,
    currentPlayerId: next,
    message:
      bid.action === "pass"
        ? `${playerName(playerId, state.playerNames)} passe. A ${playerName(next, state.playerNames)} de parler.`
        : bid.action === "bid"
          ? `${playerName(playerId, state.playerNames)} annonce ${bid.value} a ${formatContractMode(bidMode!)}. A ${playerName(next, state.playerNames)} de parler.`
          : bid.action === "capot"
            ? `${playerName(playerId, state.playerNames)} annonce capot a ${formatContractMode(bidMode!)}. A ${playerName(next, state.playerNames)} de parler.`
            : bid.action === "coinche"
              ? `${playerName(playerId, state.playerNames)} contre. A ${playerName(next, state.playerNames)} de parler.`
              : `${playerName(playerId, state.playerNames)} surcontre. A ${playerName(next, state.playerNames)} de parler.`,
  };
}

export function getCurrentContract(state: GameState): Contract | null {
  return currentHighestBid(state.bids);
}

export function playableCardsForCurrentPlayer(state: GameState): Card[] {
  if (state.phase !== "playing") {
    return [];
  }

  const mode = resolveContractMode(state);
  if (!mode) {
    return [];
  }

  return getLegalCards(
    state.hands[state.currentPlayerId],
    state.currentTrick,
    state.currentPlayerId,
    mode,
    resolveGameRules(state.settings).cardPlay,
  );
}

export function playCard(state: GameState, playerId: PlayerId, card: Card): GameState {
  if (state.phase === "finished" || state.phase === "game-over") {
    return state;
  }

  const mode = resolveContractMode(state);
  if (state.phase !== "playing" || !mode || !state.contract) {
    throw new Error("Cards can only be played after a contract has been chosen.");
  }

  if (state.currentPlayerId !== playerId) {
    throw new Error(`It is player ${state.currentPlayerId}'s turn, not player ${playerId}'s turn.`);
  }

  const hand = state.hands[playerId];
  const rules = resolveGameRules(state.settings);
  if (!hand.some((handCard) => sameCard(handCard, card))) {
    throw new Error(`Player ${playerId} does not have ${formatCard(card)}.`);
  }

  if (!isLegalCard(hand, state.currentTrick, card, playerId, mode, rules.cardPlay)) {
    throw new Error(`The card ${formatCard(card)} is not legal for this trick.`);
  }

  const announcements = !rules.announcements.enabled
    ? emptyAnnouncementState()
    : state.completedTricks.length === 0
      ? declareAnnouncementsForPlayer(
          state.announcements,
          hand,
          playerId,
          mode,
          rules.announcements,
        )
      : state.announcements ?? emptyAnnouncementState();
  const belote = rules.belote.enabled
    ? playBeloteCard(
        state.belote,
        hand,
        playerId,
        card,
        mode,
        rules.belote.points,
        rules.belote.allowInAllTrump,
      )
    : emptyBeloteState();

  const nextHand = hand.filter((handCard) => !sameCard(handCard, card));
  const nextHands = {
    ...state.hands,
    [playerId]: nextHand,
  };
  const nextTrick = {
    ...state.currentTrick,
    cards: [...state.currentTrick.cards, { playerId, card }],
  };

  if (nextTrick.cards.length < 4) {
    const next = nextPlayer(playerId);
    return {
      ...state,
      hands: nextHands,
      announcements,
      belote,
      currentTrick: nextTrick,
      currentPlayerId: next,
      message: `${playerName(playerId, state.playerNames)} a joue ${formatCard(card)}.`,
    };
  }

  const winnerId = getTrickWinner(nextTrick, mode);
  const winnerTeam = playerTeam(winnerId);
  const isLastTrick = nextHands[0].length === 0;
  const isCapot = isLastTrick
    && rules.trickScoring.capotLastTrickBonus !== rules.trickScoring.lastTrickBonus
    && state.completedTricks.length === 7
    && state.completedTricks.every((trick) => playerTeam(trick.winnerId) === winnerTeam);
  const points = trickPoints(nextTrick.cards, mode, isLastTrick, isCapot, rules.trickScoring);
  const trickPointsByTeam = {
    ...state.trickPoints,
    [winnerTeam]: state.trickPoints[winnerTeam] + points,
  };
  const completedTricks = [
    ...state.completedTricks,
    {
      ...nextTrick,
      winnerId,
      points,
    },
  ];
  const tricksWonByTeam: Record<TeamId, number> = {
    0: completedTricks.filter((trick) => playerTeam(trick.winnerId) === 0).length,
    1: completedTricks.filter((trick) => playerTeam(trick.winnerId) === 1).length,
  };
  const result =
    isLastTrick
      ? scoreRound({
          contract: state.contract,
          settings: state.settings,
          rules,
          trickPointsByTeam,
          tricksWonByTeam,
          announcementPointsByTeam: announcements.pointsByTeam,
          belotePointsByTeam: belote.pointsByTeam,
        })
      : null;

  const nextState: GameState = {
    ...state,
    phase: isLastTrick ? "finished" : "playing",
    hands: nextHands,
    announcements,
    belote,
    currentPlayerId: winnerId,
    currentTrick: {
      leaderId: winnerId,
      cards: [],
    },
    completedTricks,
    trickPoints: trickPointsByTeam,
    result: result ?? state.result,
    roundScore: result?.kind === "played" ? result.roundScore : state.roundScore,
    message:
      isLastTrick
        ? result?.kind === "played" && result.contractSucceeded
          ? `Contrat reussi. ${playerName(winnerId, state.playerNames)} gagne le dernier pli.`
          : `Contrat chute. ${playerName(winnerId, state.playerNames)} gagne le dernier pli.`
        : `${playerName(winnerId, state.playerNames)} remporte le pli et rejoue.`,
  };

  if (!isLastTrick || !result) {
    return nextState;
  }

  return finishRound(
    nextState,
    result,
    result.contractSucceeded
      ? `Contrat reussi. ${playerName(winnerId, state.playerNames)} gagne le dernier pli.`
      : `Contrat chute. ${playerName(winnerId, state.playerNames)} gagne le dernier pli.`,
  );
}

export function resetGame(random = Math.random): GameState {
  return createInitialGame(random);
}

export function startNextRound(state: GameState, random = Math.random): GameState {
  if (state.phase !== "finished") {
    return state;
  }

  return createRoundState({
    random,
    settings: state.settings,
    playerNames: state.playerNames ?? createRandomPlayerNames(random),
    roundHistory: state.roundHistory,
    roundNumber: state.roundNumber + 1,
    startingPlayerId: nextStartingPlayer(state.startingPlayerId),
    totalScore: state.totalScore,
    winnerTeam: null,
  });
}

export function getDefaultTargetScore(scoringMode: GameSettings["scoringMode"]): number {
  return normalizeGameSettings({ scoringMode }).targetScore;
}
