import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { TrainingDuoError } from "@/lib/server/trainingDuoError";
import {
  parseCreateDuo, parseDuoMutation, parseJoinDuo, readDuoJson,
} from "@/lib/server/trainingDuoValidation";

describe("training duo request validation", () => {
  it("accepts only four exact levels", () => {
    for (const level of [1, 2, 3, 4]) expect(parseCreateDuo({ level })).toEqual({ level });
    for (const body of [{ level: 0 }, { level: 5 }, { level: "4" }, { level: 1, hostId: "forged" }]) {
      expect(() => parseCreateDuo(body)).toThrow(TrainingDuoError);
    }
  });

  it("normalizes a full code and hides invalid codes behind a generic not-found", () => {
    expect(parseJoinDuo({ code: "  abcdefghjk " })).toEqual({ code: "ABCDEFGHJK" });
    for (const body of [{ code: "ABC" }, { code: "ABCDEFGHI0" }, { code: "ABCDEFGHIJ", userId: "x" }]) {
      expect(() => parseJoinDuo(body)).toThrow(TrainingDuoError);
    }
    expect(() => parseJoinDuo({ code: "ABC" })).toThrowError("Session introuvable ou inaccessible.");
  });

  it("rejects injected actor fields and malformed intent shapes", () => {
    const valid = [
      { type: "set-ready", ready: true }, { type: "start" }, { type: "ready-next" },
      { type: "leave" }, { type: "cancel" },
      { type: "submit-answer", answer: { selectedAssertionIds: ["shows-suit"] } },
    ];
    for (const intent of valid) expect(parseDuoMutation({ expectedVersion: 3, intent }).intent).toEqual(intent);
    for (const intent of [
      { type: "start", actorId: "other" },
      { type: "set-ready", ready: true, userId: "other" },
      { type: "submit-answer", answer: { selectedAssertionIds: [], score: 1 } },
      { type: "submit-answer", answer: { selectedAssertionIds: ["shows-suit", "shows-suit"] } },
      { type: "submit-answer", answer: { selectedAssertionIds: ["not-an-assertion"] } },
      { type: "submit-answer", answer: { selectedAssertionIds: "shows-suit" } },
    ]) {
      expect(() => parseDuoMutation({ expectedVersion: 3, intent })).toThrow(TrainingDuoError);
    }
    expect(() => parseDuoMutation({ expectedVersion: -1, intent: { type: "start" } })).toThrow();
    expect(() => parseDuoMutation({ expectedVersion: 0, intent: { type: "start" }, hostId: "other" })).toThrow();
  });

  it("rejects malformed and oversized bodies before parsing an intent", async () => {
    await expect(readDuoJson(new Request("http://localhost/duo", { method: "POST", body: "{" }))).rejects.toThrow();
    await expect(readDuoJson(new Request("http://localhost/duo", {
      method: "POST", body: JSON.stringify({ value: "x".repeat(3_000) }),
    }))).rejects.toThrow();
  });
});
