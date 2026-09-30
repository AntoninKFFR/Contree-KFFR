import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { createInitialGame } from "@/engine/game";
import type { GameState } from "@/engine/types";
import type { RoomPlayerRow, RoomRow } from "@/lib/roomTypes";
import { executeIntent } from "@/lib/server/multiplayerService";

const db = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/supabaseAdmin", () => ({ getSupabaseAdmin: () => db }));
let ready: boolean;
let state: GameState;
let room: RoomRow;
let players: RoomPlayerRow[];
const archives = new Set<string>();
const jobs = new Set<string>();
const awards = new Set<string>();
beforeEach(() => {
  vi.clearAllMocks();
  archives.clear(); jobs.clear(); awards.clear();
  ready = false;
  state = createInitialGame(() => 0.1);
  room = { id:"room",code:"ABC123",status:"playing",host_user_id:"host",active_game_id:"game",
    scoring_mode:state.settings.scoringMode,target_score:state.settings.targetScore,game_phase:"bidding",
    state_version:8,turn_deadline_at:null,created_at:"2026-09-30T00:00:00Z",updated_at:"2026-09-30T00:00:00Z",
    started_at:"2026-09-30T00:00:00Z",finished_at:null };
  players = [0,1,2,3].map((seat) => ({ id:`seat-${seat}`,room_id:"room",seat_index:seat as 0|1|2|3,
    kind:"human",user_id:seat === 0 ? "host" : `user-${seat}`,bot_profile_id:null,display_name:`P${seat}`,
    is_ready:true,is_connected:true,bot_takeover:false,last_seen_at:new Date().toISOString(),joined_at:null,
    left_at:null,created_at:"",updated_at:"" }));
  db.from.mockImplementation((table: string) => {
    const result = () => ({data:table === "rooms" ? room : table === "room_game_states" ? {state} : players,error:null});
    const query = { select:vi.fn().mockReturnThis(),eq:vi.fn().mockReturnThis(),
      maybeSingle:vi.fn().mockImplementation(async () => result()),
      order:vi.fn().mockImplementation(async () => result()),in:vi.fn().mockResolvedValue({data:[],error:null}) };
    return query;
  });
  db.rpc.mockImplementation(async (name, params) => {
    if (name === "progression_game_xp_schema_version") return ready
      ? {data:"20260930200000",error:null} : {data:null,error:{code:"PGRST202"}};
    if (name === "commit_room_state") {
      state = params.p_state;
      room = {...room,status:params.p_status,state_version:room.state_version+1,game_phase:state.phase};
      if (params.p_archive_game) { archives.add(params.p_archive_game.id); jobs.add(params.p_archive_game.id); }
      return {data:true,error:null};
    }
    if (name === "apply_progression_multiplayer_game") {
      const applied = awards.has(params.p_game_id);
      awards.add(params.p_game_id);
      return {data:applied ? "already_applied" : "applied",error:null};
    }
    return {data:"applied",error:null};
  });
});
describe("application before Game XP migration", () => {
  it("blocks the actual terminal commit before any mutation, then retries the same forfeit", async () => {
    const before = structuredClone(state);
    await expect(executeIntent("room","host",8,{type:"forfeit-game"})).rejects.toMatchObject({status:503});
    expect(db.rpc.mock.calls.map(([name]) => name)).toEqual(["progression_game_xp_schema_version"]);
    expect(state).toEqual(before);
    expect(room.status).toBe("playing");
    expect(room.state_version).toBe(8);
    expect(archives.size + jobs.size + awards.size).toBe(0);
    ready = true;
    await executeIntent("room","host",8,{type:"forfeit-game"});
    expect(state.phase).toBe("game-over");
    expect(room.status).toBe("finished");
    expect([...archives]).toEqual(["game"]);
    expect([...jobs]).toEqual(["game"]);
    expect([...awards]).toEqual(["game"]);
    expect(db.rpc.mock.calls.filter(([name]) => name === "commit_room_state")).toHaveLength(1);
  });
  it("continues a normal action without requiring schema readiness", async () => {
    await executeIntent("room","host",8,{type:"game-action",action:{type:"pass"}});
    expect(state.currentPlayerId).toBe(1);
    expect(db.rpc.mock.calls.some(([name]) => name === "progression_game_xp_schema_version")).toBe(false);
    expect(archives.size).toBe(0);
  });
  it("guards all three archive RPCs before they are invoked", () => {
    const source = readFileSync("lib/server/multiplayerService.ts","utf8");
    for (const fn of ["commit", "commitBotTakeover", "commitTimedOutTurn"]) {
      const body = source.split(`async function ${fn}(`)[1].split("\nasync function ")[0];
      expect(body.indexOf("await assertProgressionArchiveReady(archive)")).toBeGreaterThan(0);
      expect(body.indexOf("await assertProgressionArchiveReady(archive)")).toBeLessThan(body.indexOf("await getSupabaseAdmin().rpc"));
    }
  });
});
