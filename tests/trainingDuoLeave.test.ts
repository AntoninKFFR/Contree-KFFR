import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrainingDuoParticipantRow, TrainingDuoSessionRow } from "@/lib/server/trainingDuoProjection";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/supabaseAdmin", () => ({ getSupabaseAdmin: () => database }));

import { executeTrainingDuoIntent, trainingDuoView } from "@/lib/server/trainingDuoService";

const ID = "a61e2320-39c4-4c98-9f98-37fb187f7a21";
const NOW = "2026-09-27T12:00:00.000Z";
let session: TrainingDuoSessionRow;
let participants: TrainingDuoParticipantRow[];
let database: { rpc: ReturnType<typeof vi.fn>; from: ReturnType<typeof vi.fn> };

function setup(status: "lobby" | "active") {
  session = {
    id: ID, code: "ABCDEFGHJK", host_user_id: "host", status,
    question_phase: status === "active" ? "answering" : null, level: 1,
    axis_id: "bid-reading", axis_version: 1, doctrine_id: "advanced_rules_v4",
    doctrine_revision: "4.1", generator_version: 1, ruleset_id: "contree-kffr",
    ruleset_version: 1, series_length: 10, current_index: 0, state_version: 2,
    created_at: NOW, updated_at: NOW, started_at: status === "active" ? NOW : null,
    finished_at: null, cancel_reason: null,
  };
  participants = (["host", "guest"] as const).map((userId, slot) => ({
    id: `participant-${slot}`, session_id: ID, user_id: userId, slot: slot as 0 | 1,
    display_name: userId, is_ready: false, last_seen_at: NOW, ready_for_next: false,
    joined_at: NOW, left_at: null,
  }));
  const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
    if (name === "training_duo_expire") {
      const member = participants.some((player) => player.user_id === args.p_actor && player.left_at === null);
      return member ? { data: null, error: null }
        : { data: null, error: { message: "duo_session_not_found" } };
    }
    if (name === "training_duo_mutate" && args.p_type === "leave") {
      if (session.status === "lobby" && args.p_actor === "guest") {
        participants[1].left_at = NOW;
      } else {
        session.status = "cancelled";
        session.question_phase = null;
        session.finished_at = NOW;
        session.cancel_reason = "left";
      }
      session.state_version += 1;
      return { data: null, error: null };
    }
    throw new Error(`Unexpected RPC: ${name}`);
  });
  const from = vi.fn((table: string) => ({ select: () => ({ eq: () => {
    const result = () => ({ data: table === "training_duo_sessions" ? session
      : table === "training_duo_participants" ? participants
        : table === "training_duo_answers" ? [] : { seed: 1234 }, error: null });
    return {
      maybeSingle: async () => result(),
      then: (resolve: (value: ReturnType<typeof result>) => unknown) => Promise.resolve(result()).then(resolve),
    };
  } }) }));
  database = { rpc, from };
}

beforeEach(() => setup("lobby"));

describe("training duo lobby leave service contract", () => {
  it("commits a guest leave without a post-commit member refetch, then denies GET", async () => {
    const result = await executeTrainingDuoIntent(ID, "guest", 2, { type: "leave" });
    expect(result).toBeNull();
    expect(database.rpc).toHaveBeenCalledWith("training_duo_mutate", expect.objectContaining({
      p_session_id: ID, p_actor: "guest", p_type: "leave", p_expected_version: 2,
    }));
    expect(database.from.mock.calls.filter(([table]) => table === "training_duo_sessions")).toHaveLength(1);
    expect(participants[1].left_at).not.toBeNull();
    await expect(trainingDuoView(ID, "guest")).rejects.toMatchObject({ code: "duo_session_not_found" });
    expect(session.status).toBe("lobby");
  });

  it("returns the cancelled view when the lobby host leaves", async () => {
    const result = await executeTrainingDuoIntent(ID, "host", 2, { type: "leave" });
    expect(result?.session.status).toBe("cancelled");
    expect(result?.session.cancelReason).toBe("left");
  });

  it("returns the cancelled view when a participant leaves an active session", async () => {
    setup("active");
    const result = await executeTrainingDuoIntent(ID, "guest", 2, { type: "leave" });
    expect(result?.session.status).toBe("cancelled");
    expect(result?.session.cancelReason).toBe("left");
    expect(participants[1].left_at).toBeNull();
  });
});
