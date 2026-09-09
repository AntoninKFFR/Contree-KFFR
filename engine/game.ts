import {
  SUIT_LABELS,
  SUIT_SYMBOLS,
  createDeck,
  formatCard,
  sameCard,
  shuffleDeck,
  sortHand,
} from "./cards";
import {
  declareAnnouncementsForPlayer,
  emptyAnnouncementState,
  emptyBeloteState,
  playBeloteCard,
  resolveAnnouncements,
} from "./announcements";
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
import type {
  Bid,
  BidValue,
  Card,
  Contract,
  GameSettings,
  GameState,
  PlayerId,
  Suit,
  TeamId,
} from "./types";

type PlayerNames = Record<PlayerId, string>;

function defaultTargetScore(scoringMode: GameSettings["scoringMode"]): number {
  return scoringMode === "announced-points" ? 500 : 1000;
}

function resolveSettings(settings: Partial<GameSettings>): GameSettings {
  const scoringMode = settings.scoringMode ?? "ffb";

  return {
    scoringMode,
    targetScore: settings.targetScore ?? defaultTargetScore(scoringMode),
  };
}

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
    settings: resolveSettings(settings),
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
  if (state.settings.scoringMode !== "ffb" || result.belotePointsByTeam[teamId] === 0) {
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
    trickPointsByTeam: result.trickPointsByTeam,
    tricksWonByTeam,
    announcementPointsByTeam: result.announcementPointsByTeam,
    belotePointsByTeam: { 0: 0, 1: 0 },
  });
  return state.totalScore[teamId] + withoutBelote.roundScore[teamId] < state.settings.targetScore;
}

function finishRound(state: GameState, result: GameState["result"], baseMessage: string): GameState {
  if (!result) {
    return state;
  }

  const totalScore = addScores(state.totalScore, result.roundScore);
  let winnerTeam = winningTeam(totalScore, state.settings.targetScore);
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

function formatSuit(suit: Suit): string {
  return `${SUIT_LABELS[suit]} ${SUIT_SYMBOLS[suit]}`;
}

function sortHandsForTrump(hands: GameState["hands"], trump: Suit): GameState["hands"] {
  return {
    0: sortHand(hands[0], trump),
    1: sortHand(hands[1], trump),
    2: sortHand(hands[2], trump),
    3: sortHand(hands[3], trump),
  };
}

function currentHighestBid(bids: Bid[]): Contract | null {
  let contract: Contract | null = null;

  for (const bid of bids) {
    if (bid.action === "bid") {
      contract = {
        kind: "points",
        playerId: bid.playerId,
        teamId: playerTeam(bid.playerId),
        value: bid.value,
        trump: bid.trump,
        status: "normal",
      };
    }

    if (bid.action === "capot") {
      contract = {
        kind: "capot",
        playerId: bid.playerId,
        teamId: playerTeam(bid.playerId),
        value: 250,
        trump: bid.trump,
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
    trump: contract.trump,
    hands: sortHandsForTrump(state.hands, contract.trump),
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
        trump: Suit;
      }
    | {
        action: "capot";
        trump: Suit;
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

  const currentContract = currentHighestBid(state.bids);

  if ((bid.action === "bid" || bid.action === "capot") && currentContract && currentContract.status !== "normal") {
    throw new Error("A normal bid is not allowed after a contract has been countered.");
  }

  if (bid.action === "bid" && !isAllowedBidValue(bid.value)) {
    throw new Error("This bid value is not allowed.");
  }

  if (bid.action === "bid" && !isHigherBid(bid.value, currentContract)) {
    throw new Error("A new bid must be higher than the current contract.");
  }

  if (bid.action === "capot" && !canBidCapot(currentContract)) {
    throw new Error("A capot bid is not allowed over the current contract.");
  }

  if (bid.action === "coinche" && !canCoinche(playerId, currentContract)) {
    throw new Error("This player cannot coinche the current contract.");
  }

  if (bid.action === "surcoinche" && !canSurcoinche(playerId, currentContract)) {
    throw new Error("This player cannot surcoinche the current contract.");
  }

  const nextBids: Bid[] = [...state.bids, { playerId, ...bid }];

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
          ? `${playerName(playerId, state.playerNames)} annonce ${bid.value} a ${formatSuit(bid.trump)}. A ${playerName(next, state.playerNames)} de parler.`
          : bid.action === "capot"
            ? `${playerName(playerId, state.playerNames)} annonce capot a ${formatSuit(bid.trump)}. A ${playerName(next, state.playerNames)} de parler.`
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

  if (!state.trump) {
    return [];
  }

  return getLegalCards(
    state.hands[state.currentPlayerId],
    state.currentTrick,
    state.currentPlayerId,
    state.trump,
  );
}

export function playCard(state: GameState, playerId: PlayerId, card: Card): GameState {
  if (state.phase === "finished" || state.phase === "game-over") {
    return state;
  }

  if (state.phase !== "playing" || !state.trump || !state.contract) {
    throw new Error("Cards can only be played after a contract has been chosen.");
  }

  if (state.currentPlayerId !== playerId) {
    throw new Error(`It is player ${state.currentPlayerId}'s turn, not player ${playerId}'s turn.`);
  }

  const hand = state.hands[playerId];
  if (!hand.some((handCard) => sameCard(handCard, card))) {
    throw new Error(`Player ${playerId} does not have ${formatCard(card)}.`);
  }

  if (!isLegalCard(hand, state.currentTrick, card, playerId, state.trump)) {
    throw new Error(`The card ${formatCard(card)} is not legal for this trick.`);
  }

  let announcements = state.settings.scoringMode === "ffb" && state.completedTricks.length === 0
    ? declareAnnouncementsForPlayer(state.announcements, hand, playerId, state.trump)
    : state.announcements ?? emptyAnnouncementState();
  if (
    state.settings.scoringMode === "ffb"
    && state.completedTricks.length === 1
    && state.currentTrick.cards.length === 0
    && announcements.declaredPlayerIds.length === 4
  ) {
    announcements = resolveAnnouncements(
      announcements.declarations,
      announcements.declaredPlayerIds,
      state.trump,
    );
  }
  const belote = state.settings.scoringMode === "ffb"
    ? playBeloteCard(state.belote, hand, playerId, card, state.trump)
    : state.belote ?? emptyBeloteState();

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

  const winnerId = getTrickWinner(nextTrick, state.trump);
  const winnerTeam = playerTeam(winnerId);
  const isLastTrick = nextHands[0].length === 0;
  const isCapot = isLastTrick
    && state.settings.scoringMode === "ffb"
    && state.completedTricks.length === 7
    && state.completedTricks.every((trick) => playerTeam(trick.winnerId) === winnerTeam);
  const points = trickPoints(nextTrick.cards, state.trump, isLastTrick, isCapot);
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
  return defaultTargetScore(scoringMode);
}
