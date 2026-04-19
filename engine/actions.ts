import { makeBid, playCard, startNextRound } from "./game";
import type { BidValue, Card, GameState, PlayerId, Suit } from "./types";

export type GameAction =
  | {
      type: "bid";
      playerId: PlayerId;
      value: BidValue;
      trump: Suit;
    }
  | {
      type: "pass";
      playerId: PlayerId;
    }
  | {
      type: "coinche";
      playerId: PlayerId;
    }
  | {
      type: "surcoinche";
      playerId: PlayerId;
    }
  | {
      type: "play-card";
      playerId: PlayerId;
      card: Card;
    }
  | {
      type: "start-next-round";
    };

type ApplyGameActionOptions = {
  random?: () => number;
};

export function applyGameAction(
  state: GameState,
  action: GameAction,
  options: ApplyGameActionOptions = {},
): GameState {
  switch (action.type) {
    case "bid":
      return makeBid(state, action.playerId, {
        action: "bid",
        value: action.value,
        trump: action.trump,
      });
    case "pass":
      return makeBid(state, action.playerId, { action: "pass" });
    case "coinche":
      return makeBid(state, action.playerId, { action: "coinche" });
    case "surcoinche":
      return makeBid(state, action.playerId, { action: "surcoinche" });
    case "play-card":
      return playCard(state, action.playerId, action.card);
    case "start-next-round":
      return startNextRound(state, options.random);
  }
}
