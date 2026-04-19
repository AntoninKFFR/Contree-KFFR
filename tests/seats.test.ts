import { describe, expect, it } from "vitest";
import {
  firstHumanSeat,
  isBotSeat,
  isEmptySeat,
  isHumanSeat,
  SOLO_SEAT_ASSIGNMENTS,
  type SeatAssignments,
} from "@/engine/seats";

describe("seat assignments", () => {
  it("represents the current solo setup explicitly", () => {
    expect(firstHumanSeat(SOLO_SEAT_ASSIGNMENTS)).toBe(0);
    expect(isHumanSeat(SOLO_SEAT_ASSIGNMENTS, 0)).toBe(true);
    expect(isBotSeat(SOLO_SEAT_ASSIGNMENTS, 1)).toBe(true);
    expect(isBotSeat(SOLO_SEAT_ASSIGNMENTS, 2)).toBe(true);
    expect(isBotSeat(SOLO_SEAT_ASSIGNMENTS, 3)).toBe(true);
  });

  it("supports empty seats", () => {
    const seats: SeatAssignments = {
      ...SOLO_SEAT_ASSIGNMENTS,
      3: { kind: "empty" },
    };

    expect(isEmptySeat(seats, 3)).toBe(true);
    expect(isBotSeat(seats, 3)).toBe(false);
  });
});
