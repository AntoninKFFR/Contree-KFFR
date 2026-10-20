import type { SoloIdentity } from "../solo/api";
import type { Card } from "../solo/contract";
import type { RoomApi } from "./api";
import { RoomFailure, type MultiplayerRoomView, type RoomIntent } from "./contract";

export type RoomState = { room: MultiplayerRoomView | null; active: boolean; busy: boolean; requiresSync: boolean; error: string | null; pendingCard: Card | null };
export const initialRoomState: RoomState = { room: null, active: false, busy: false, requiresSync: true, error: null, pendingCard: null };
/** Every request is fenced by screen generation AND live account/token identity. */
export function createRoomController(input: { id: string; owner: string; identity: () => SoloIdentity | null; api: RoomApi; onChange: (s: RoomState) => void; unauthorized: () => void }) {
  let state = initialRoomState, live = true, generation = 0, readRevision = 0, reading: Promise<void> | null = null, maintenance = false;
  const requests = new Set<AbortController>();
  const emit = (patch: Partial<RoomState>) => {
    if (Object.entries(patch).every(([key, value]) => Object.is(state[key as keyof RoomState], value))) return;
    state = { ...state, ...patch }; if (live) input.onChange(state);
  };
  function identity() { const who = input.identity(); return who?.user.id === input.owner ? who : null; }
  function accept(next: MultiplayerRoomView) {
    if (next.room.id !== input.id || state.room && next.room.state_version < state.room.room.state_version) return false;
    const current = state.room;
    if (current && next.room.state_version === current.room.state_version && next.viewerSeatIndex === current.viewerSeatIndex && next.gameId === current.gameId) {
      // The game is immutable within one server version. Presence-only reads must
      // not restart presentation/audio or rebuild the fan every four seconds.
      next = { ...next, game: current.game };
      if (next.isHost === current.isHost && next.canClaimHost === current.canClaimHost
        && JSON.stringify(next.players) === JSON.stringify(current.players)
        && JSON.stringify(next.room) === JSON.stringify(current.room)) return true;
    }
    emit({ room: next });
    return true;
  }
  async function request<T>(fn: (who: SoloIdentity, signal: AbortSignal) => Promise<T>): Promise<T | undefined> {
    const who = identity(); if (!live || !state.active || !who) return;
    const epoch = generation, controller = new AbortController(); requests.add(controller);
    const current = () => live && state.active && generation === epoch && identity()?.access_token === who.access_token;
    try { const value = await fn(who, controller.signal); return current() ? value : undefined; }
    catch (error) { if (current()) { if (error instanceof RoomFailure && error.status === 401) input.unauthorized(); throw error; } }
    finally { requests.delete(controller); }
  }
  async function load() {
    if (reading) return reading;
    const revision = ++readRevision;
    const task = (async () => {
      try { const next = await request((who, signal) => input.api.load(who, signal, input.id)); if (next && revision === readRevision && accept(next)) emit({ requiresSync: false, error: null }); }
      catch (error) { if (revision === readRevision) emit({ requiresSync: true, error: error instanceof Error ? error.message : "Table indisponible." }); }
    })();
    reading = task; try { await task; } finally { if (reading === task) reading = null; }
  }
  return {
    get state() { return state; },
    load,
    invalidate() { if (live && state.active) { readRevision++; reading = null; emit({ requiresSync: true }); } },
    async resume() { if (!live) return; emit({ active: true, requiresSync: true }); await load(); },
    suspend() { generation++; for (const r of requests) r.abort(); requests.clear(); reading = null; maintenance = false; emit({ active: false, busy: false, requiresSync: true, pendingCard: null, room: null }); },
    dispose() { live = false; generation++; for (const r of requests) r.abort(); requests.clear(); },
    async move(intent: RoomIntent): Promise<boolean> {
      if (!live || !state.active || state.busy || state.requiresSync || !state.room) return false;
      const epoch = generation, previous = state.room;
      emit({ busy: true, error: null, pendingCard: intent.type === "game-action" && intent.action.type === "play-card" ? intent.action.card : null });
      try {
        const next = await request((who, signal) => input.api.intent(who, signal, previous, intent));
        if (!next) return false;
        if (next.room.state_version <= previous.room.state_version) throw new RoomFailure("Confirmation de version invalide. La table a été rechargée.", 502, "invalid_acknowledgement");
        accept(next); emit({ pendingCard: null }); return true;
      } catch (error) {
        // A POST may already have committed. Reconcile by GET; never replay it.
        readRevision++; reading = null;
        emit({ requiresSync: true, pendingCard: null }); await load();
        if (live && generation === epoch) emit({ error: error instanceof Error ? error.message : "Action refusée." });
        return false;
      } finally { if (live && generation === epoch) emit({ busy: false, pendingCard: null }); }
    },
    async maintain(kind: "heartbeat" | "tick") {
      if (!state.active || state.busy || maintenance || state.requiresSync || state.room?.viewerSeatIndex == null) return;
      maintenance = true;
      try { const next = await request((who, signal) => input.api[kind](who, signal, input.id)); if (next) accept(next); }
      catch { await load(); }
      finally { maintenance = false; }
    },
  };
}
