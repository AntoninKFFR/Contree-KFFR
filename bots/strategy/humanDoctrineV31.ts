import { BID_VALUES } from "@/engine/bidding";
import type { BidValue, GameState } from "@/engine/types";
import {
  chooseHumanDoctrineV3Bid,
  type HumanDoctrineV3Action,
  type HumanDoctrineV3Trace,
} from "@/bots/strategy/humanDoctrineV3";

export type FitEscalation = "none" | "moderate" | "strong";

export type HumanDoctrineV31Trace = HumanDoctrineV3Trace & {
  doctrineVersion: "3.1";
  firstMessageCeiling: BidValue | null;
  fitEscalation: FitEscalation;
  selectedRebidStep: BidValue | null;
};

export type HumanDoctrineV31Decision = HumanDoctrineV3Action & { trace: HumanDoctrineV31Trace };

function capBid(value: BidValue | null, ceiling: BidValue): BidValue | null {
  return value === null ? null : value > ceiling ? ceiling : value;
}

function raiseOne(value: BidValue | null): BidValue | null {
  if (value === null) return null;
  const index = BID_VALUES.indexOf(value);
  return index < 0 ? null : BID_VALUES[Math.min(BID_VALUES.length - 1, index + 1)];
}

export function chooseHumanDoctrineV31Bid(state: GameState): HumanDoctrineV31Decision {
  const base = chooseHumanDoctrineV3Bid(state);
  const selected = base.trace.evaluations.find((evaluation) => evaluation.trump === base.trace.trump)!;
  const isOpening = base.trace.auctionRole === "opening" && base.trace.ownPreviousMessage === null;
  const trulyExceptionalOpening = selected.trumpStructure.hasBoth
    && (
      (selected.trumpQuantity >= 5 && selected.outsideAces >= 1)
      || (selected.trumpQuantity >= 4 && selected.outsideAces >= 2)
    );
  const firstMessageCeiling = isOpening
    ? trulyExceptionalOpening
      ? base.trace.intrinsicCeiling
      : capBid(base.trace.intrinsicCeiling, 100)
    : null;

  let finalAction: HumanDoctrineV3Action = base.trace.finalAction;
  let reason = base.trace.reason;
  let fitEscalation: FitEscalation = "none";
  let selectedRebidStep: BidValue | null = null;

  const unsupportedTwoTrumpProbe = isOpening
    && base.trace.trumpFoundation === "one-major"
    && selected.trumpQuantity === 2
    && selected.outsideAces === 0
    && selected.protectedOutsideTens === 0;

  if (unsupportedTwoTrumpProbe) {
    finalAction = { action: "pass" };
    reason = "Deux atouts avec une seule majeure et sans controle exterieur ne suffisent pas pour sonder a 80.";
  } else if (isOpening && base.action === "bid" && base.value > (firstMessageCeiling ?? base.value)) {
    finalAction = { action: "bid", value: firstMessageCeiling!, trump: base.trump };
    reason = "Le premier message reste sous le plafond intrinseque; 110 est reserve aux mains exceptionnellement autonomes.";
  } else {
    const expressiveTarget = raiseOne(base.trace.competitiveMinimum);
    const canExpressStrongFit = base.trace.communicationIntent === "rebid-after-support"
      && base.trace.partnerFit === "strong-fit"
      && base.trace.dependency === "autonomous"
      && base.trace.trumpFoundation === "controlled-long"
      && base.trace.rebidCeiling !== null
      && expressiveTarget !== null
      && expressiveTarget <= base.trace.rebidCeiling;
    if (canExpressStrongFit) {
      finalAction = { action: "bid", value: expressiveTarget, trump: base.trace.trump };
      fitEscalation = "strong";
      selectedRebidStep = expressiveTarget;
      reason = "Le strong fit confirme une main autonome et controlled-long; le rebid exprime plus que le minimum utile.";
    } else if (base.trace.partnerFit === "strong-fit") {
      fitEscalation = "moderate";
      selectedRebidStep = base.action === "bid" ? base.value : null;
    }
  }

  const trace: HumanDoctrineV31Trace = {
    ...base.trace,
    doctrineVersion: "3.1",
    firstMessageCeiling,
    fitEscalation,
    selectedRebidStep,
    finalAction,
    reason,
  };
  return { ...finalAction, trace } as HumanDoctrineV31Decision;
}
