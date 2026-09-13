import { getLegalCards } from "./rules";
import { normalizeContractMode } from "./contractMode";
import type { GameRulesetSnapshot } from "./rulesets/types";
import type { Card, ContractMode, PlayerId, Trick } from "./types";

const SUIT_NAMES = { clubs: "Trèfle", diamonds: "Carreau", hearts: "Cœur", spades: "Pique" } as const;

export function explainIllegalCard(input: {
  hand: Card[];
  trick: Trick;
  card: Card;
  playerId: PlayerId;
  mode: ContractMode;
  rules: GameRulesetSnapshot["cardPlay"];
}): string | null {
  const legalCards = getLegalCards(input.hand, input.trick, input.playerId, input.mode, input.rules);
  if (legalCards.some((card) => card.suit === input.card.suit && card.rank === input.card.rank)) return null;
  const leadSuit = input.trick.cards[0]?.card.suit;
  if (!leadSuit) return "Cette carte n'est pas jouable.";
  const matchingSuit = input.hand.filter((card) => card.suit === leadSuit);
  const mode = normalizeContractMode(input.mode);

  if (matchingSuit.length > 0) {
    if (mode.kind === "suit" && leadSuit === mode.suit && legalCards.length < matchingSuit.length) {
      return "Tu dois monter à l'atout.";
    }
    if (mode.kind === "all-trump" && legalCards.length < matchingSuit.length) {
      return `Tu dois monter à ${SUIT_NAMES[leadSuit]}.`;
    }
    return `Tu dois fournir à ${SUIT_NAMES[leadSuit]}.`;
  }

  if (mode.kind === "suit") {
    const trumps = input.hand.filter((card) => card.suit === mode.suit);
    if (trumps.length > 0 && legalCards.every((card) => card.suit === mode.suit)) {
      const trumpAlreadyPlayed = input.trick.cards.some((played) => played.card.suit === mode.suit);
      return trumpAlreadyPlayed && legalCards.length < trumps.length
        ? "Tu dois surcouper."
        : "Tu dois couper.";
    }
  }

  return "Cette carte n'est pas jouable.";
}
