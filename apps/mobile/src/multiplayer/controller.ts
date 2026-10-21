import type { SoloIdentity } from "../solo/api";
import type { Card } from "../solo/contract";
import type { RoomApi } from "./api";
import { RoomFailure, type MultiplayerRoomView, type RoomIntent } from "./contract";
import { seatErrorCode, traceSeat, type SeatTrace } from "./seat-trace";

export type SeatReservation = { seat: number; phase: "synchronizing" | "sending" | "confirmed" | "failed"; message?: string };
export type RoomState = { room: MultiplayerRoomView | null; active: boolean; busy: boolean; requiresSync: boolean; error: string | null; pendingCard: Card | null; seatReservation: SeatReservation | null };
export const initialRoomState: RoomState = { room: null, active: false, busy: false, requiresSync: true, error: null, pendingCard: null, seatReservation: null };
/** Every request is fenced by screen generation AND live account/token identity. */
export function createRoomController(input: { id: string; owner: string; identity: () => SoloIdentity | null; api: RoomApi; onChange: (s: RoomState) => void; unauthorized: () => void; trace?: (value: SeatTrace) => void }) {
  let state = initialRoomState, live = true, generation = 0, readRevision = 0, reading: Promise<void> | null = null, maintenance = false;
  let seatReadEpoch = 0, seatPosting = false, seatRefreshQueued = false;
  const trace = input.trace ?? traceSeat;
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
    // Realtime may request a read while the seat transaction is committing.
    // Start that read after the POST, rather than publishing a torn snapshot.
    if (seatPosting) { seatRefreshQueued = true; return; }
    if (reading) return reading;
    const revision = ++readRevision, seatEpoch = seatReadEpoch;
    const task = (async () => {
      try { const next = await request((who, signal) => input.api.load(who, signal, input.id)); if (next && revision === readRevision && seatEpoch === seatReadEpoch && accept(next)) emit({ requiresSync: false, error: null }); }
      catch (error) { if (revision === readRevision && seatEpoch === seatReadEpoch) emit({ requiresSync: true, error: error instanceof Error ? error.message : "Table indisponible." }); }
    })();
    reading = task; try { await task; } finally { if (reading === task) reading = null; }
  }
  async function reserveSeat(seat: number): Promise<boolean> {
    trace({ event: "touch", seat, active: state.active, busy: state.busy, requiresSync: state.requiresSync, viewerBefore: state.room?.viewerSeatIndex, expectedVersion: state.room?.room.state_version });
    const fail = (message: string, code: string) => {
      trace({ event: "blocked", seat, code });
      // Do not replace the pending state of an already accepted first tap.
      if (live) emit({ error: message, ...(!state.busy ? { seatReservation: { seat, phase: "failed" as const, message } } : {}) });
      return false;
    };
    if (!live || !state.active) return fail("La table n’est pas active. Reviens au salon puis réessaie.", "inactive");
    if (state.busy) return fail("Une action est déjà en cours. Attends sa confirmation.", "busy");
    const who = identity();
    if (!who?.access_token || who.expires_at !== undefined && who.expires_at * 1000 <= Date.now()) {
      input.unauthorized(); return fail("Ta session doit être vérifiée. Reconnecte-toi puis réessaie.", "session");
    }
    const epoch = generation, token = who.access_token;
    const current = () => live && state.active && generation === epoch && identity()?.access_token === token;
    const syncing = state.requiresSync || !state.room;
    emit({ busy: true, error: null, seatReservation: syncing ? { seat, phase: "synchronizing" } : null });
    let previous: MultiplayerRoomView | null = null;
    try {
      if (syncing) { trace({ event: "sync", seat }); await load(); }
      if (!current()) return false;
      if (state.requiresSync || !state.room) throw new RoomFailure("La table n’a pas pu être actualisée. Vérifie la connexion puis retouche une place.", 0, "sync_required");
      previous = state.room;
      if (previous.room.status !== "lobby") throw new RoomFailure("La table n’accepte plus de changement de place.", 409, "wrong_room_status");
      if (previous.viewerSeatIndex === seat) { emit({ seatReservation: { seat, phase: "confirmed" } }); trace({ event: "confirmed", seat, viewerAfter: seat, receivedVersion: previous.room.state_version }); return true; }
      if (previous.players.find((p) => p.seat_index === seat)?.kind !== "empty") throw new RoomFailure("Cette place n’est plus libre. Choisis une autre place.", 409, "seat_occupied");
      // Fence both GETs and maintenance started before this seat operation.
      seatReadEpoch++; readRevision++; reading = null; seatPosting = true;
      emit({ seatReservation: { seat, phase: "sending" } });
      trace({ event: "post", seat, expectedVersion: previous.room.state_version, viewerBefore: previous.viewerSeatIndex });
      const next = await request((actor, signal) => input.api.intent(actor, signal, previous!, { type: "join-seat", seatIndex: seat as 0 | 1 | 2 | 3 }));
      if (!next || !current()) return false;
      trace({ event: "ack", seat, receivedVersion: next.room.state_version, viewerAfter: next.viewerSeatIndex });
      if (next.room.state_version <= previous.room.state_version || next.viewerSeatIndex !== seat) throw new RoomFailure("Le serveur n’a pas confirmé cette place. La table a été actualisée ; retouche une place pour réessayer.", 502, "seat_not_confirmed");
      seatReadEpoch++; readRevision++;
      if (!accept(next)) throw new RoomFailure("La table a changé. Actualise puis choisis une place.", 409, "version_conflict");
      emit({ requiresSync: false, error: null, seatReservation: { seat, phase: "confirmed" } });
      trace({ event: "confirmed", seat, viewerAfter: next.viewerSeatIndex, receivedVersion: next.room.state_version });
      return true;
    } catch (error) {
      if (!current()) return false;
      if (seatPosting) {
        seatPosting = false; seatRefreshQueued = false; seatReadEpoch++; readRevision++; reading = null;
        emit({ requiresSync: true }); trace({ event: "reconcile", seat });
        await load();
        if (!current()) return false;
        trace({ event: "reconciled", seat, requiresSync: state.requiresSync, receivedVersion: state.room?.room.state_version, viewerAfter: state.room?.viewerSeatIndex });
        // A lost POST response may still have committed. Only a fresh GET can
        // confirm it; no POST is ever replayed.
        if (!state.requiresSync && previous && state.room && state.room.room.state_version > previous.room.state_version && state.room.viewerSeatIndex === seat) {
          emit({ error: null, seatReservation: { seat, phase: "confirmed" } });
          trace({ event: "confirmed", seat, viewerAfter: seat, receivedVersion: state.room.room.state_version }); return true;
        }
      }
      const message = error instanceof Error ? error.message : "La réservation a échoué. Retouche une place pour réessayer.";
      emit({ error: message, seatReservation: { seat, phase: "failed", message } });
      trace({ event: "failed", seat, code: seatErrorCode(error instanceof RoomFailure ? error.code : "network"), receivedVersion: state.room?.room.state_version, viewerAfter: state.room?.viewerSeatIndex });
      return false;
    } finally {
      if (live && generation === epoch) {
        seatPosting = false; emit({ busy: false });
        if (seatRefreshQueued) { seatRefreshQueued = false; void load(); }
      }
    }
  }
  return {
    get state() { return state; },
    load,
    dismissSeatError() { if (state.seatReservation?.phase === "failed") emit({ seatReservation: null, error: null }); },
    invalidate() { if (live && state.active) { readRevision++; reading = null; emit({ requiresSync: true }); } },
    async resume() { if (!live) return; emit({ active: true, requiresSync: true }); await load(); },
    suspend() { generation++; for (const r of requests) r.abort(); requests.clear(); reading = null; maintenance = false; seatPosting = false; seatRefreshQueued = false; emit({ active: false, busy: false, requiresSync: true, pendingCard: null, room: null, seatReservation: null }); },
    dispose() { live = false; generation++; for (const r of requests) r.abort(); requests.clear(); },
    async move(intent: RoomIntent): Promise<boolean> {
      if (intent.type === "join-seat") return reserveSeat(intent.seatIndex);
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
      const seatEpoch = seatReadEpoch;
      try { const next = await request((who, signal) => input.api[kind](who, signal, input.id)); if (next && seatEpoch === seatReadEpoch) accept(next); }
      catch { await load(); }
      finally { maintenance = false; }
    },
  };
}
