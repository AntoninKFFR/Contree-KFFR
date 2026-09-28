// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { BidReadingPublicAuction } from "@/components/training/BidReadingShared";
import type { BidReadingExercise } from "@/engine/training/bidReading";

vi.stubGlobal("React", React);
afterEach(cleanup);

it("keeps a long auction in bid order with one connector per transition and one target", () => {
  const exercise = {
    publicBids: [
      { playerId: 0, action: "pass" },
      { playerId: 1, action: "bid", value: 80, trump: "hearts" },
      { playerId: 2, action: "bid", value: 90, trump: "hearts" },
      { playerId: 3, action: "pass" },
      { playerId: 0, action: "bid", value: 100, trump: "spades" },
      { playerId: 1, action: "pass" },
    ],
    targetBidIndex: 4,
    playerNames: { 0: "Moi", 1: "Droite", 2: "Partenaire", 3: "Gauche" },
  } satisfies Pick<BidReadingExercise, "publicBids" | "targetBidIndex" | "playerNames">;
  render(React.createElement(BidReadingPublicAuction, { exercise }));
  const history = screen.getByRole("region", { name: "Historique public des enchères" });
  const bids = within(history).getAllByRole("listitem");
  expect(bids).toHaveLength(6);
  expect(bids.map((bid) => bid.querySelector("strong")?.textContent)).toEqual(["Passe", "80 ♥", "90 ♥", "Passe", "100 ♠", "Passe"]);
  expect(history.querySelectorAll(".training-auction-connector[aria-hidden=true]")).toHaveLength(5);
  expect(history.querySelectorAll('[aria-current="step"]')).toHaveLength(1);
  expect(bids[4].getAttribute("aria-current")).toBe("step");
  expect(within(bids[4]).getByText("Annonce à lire")).toBeTruthy();
});
