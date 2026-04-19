"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { AuthStatus } from "@/components/AuthStatus";
import {
  getRoomWithPlayers,
  setSeatReady,
  type RoomPlayerRow,
  type RoomWithPlayers,
} from "@/lib/rooms";
import { getSupabaseClient } from "@/lib/supabaseClient";

type PageState = "loading" | "ready" | "signed-out" | "unavailable" | "missing";

type LoadRoomOptions = {
  silent?: boolean;
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Action impossible pour le moment.";
}

function roomIdFromParams(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export default function MultiplayerRoomPage() {
  const params = useParams();
  const roomId = roomIdFromParams(params.roomId);
  const [error, setError] = useState<string | null>(null);
  const [isUpdatingReady, setIsUpdatingReady] = useState(false);
  const [pageState, setPageState] = useState<PageState>("loading");
  const [roomWithPlayers, setRoomWithPlayers] = useState<RoomWithPlayers | null>(null);
  const [session, setSession] = useState<Session | null>(null);

  const currentSeat = useMemo(() => {
    if (!session || !roomWithPlayers) return null;
    return roomWithPlayers.players.find((player) => player.user_id === session.user.id) ?? null;
  }, [roomWithPlayers, session]);

  const loadRoom = useCallback(async (options: LoadRoomOptions = {}) => {
    const supabase = getSupabaseClient();

    if (!supabase) {
      setPageState("unavailable");
      return;
    }

    if (!roomId) {
      setPageState("missing");
      return;
    }

    if (!options.silent) {
      setPageState("loading");
      setError(null);
    }

    const { data } = await supabase.auth.getSession();
    const nextSession = data.session;
    setSession(nextSession);

    if (!nextSession) {
      setPageState("signed-out");
      return;
    }

    try {
      const nextRoom = await getRoomWithPlayers(supabase, roomId);
      setRoomWithPlayers(nextRoom);
      setError(null);
      setPageState("ready");
    } catch (loadError) {
      setRoomWithPlayers(null);
      setError(errorMessage(loadError));
      setPageState("missing");
    }
  }, [roomId]);

  useEffect(() => {
    const supabase = getSupabaseClient();

    loadRoom();

    if (!supabase) return;

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      loadRoom();
    });

    return () => subscription.unsubscribe();
  }, [loadRoom]);

  useEffect(() => {
    const supabase = getSupabaseClient();

    if (!supabase || !roomId) return;

    const channel = supabase
      .channel(`room-lobby:${roomId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          filter: `room_id=eq.${roomId}`,
          schema: "public",
          table: "room_players",
        },
        () => {
          void loadRoom({ silent: true });
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          filter: `id=eq.${roomId}`,
          schema: "public",
          table: "rooms",
        },
        () => {
          void loadRoom({ silent: true });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [loadRoom, roomId]);

  async function handleToggleReady() {
    const supabase = getSupabaseClient();

    if (!supabase || !roomWithPlayers || !session || !currentSeat) return;

    setIsUpdatingReady(true);
    setError(null);

    try {
      const nextRoom = await setSeatReady(supabase, {
        ready: !currentSeat.is_ready,
        roomId: roomWithPlayers.room.id,
        userId: session.user.id,
      });
      setRoomWithPlayers(nextRoom);
      setPageState("ready");
    } catch (readyError) {
      setError(errorMessage(readyError));
    } finally {
      setIsUpdatingReady(false);
    }
  }

  return (
    <main className="min-h-dvh bg-[#f4f1e8] px-4 py-6 text-stone-950">
      <div className="mx-auto flex max-w-5xl flex-col gap-4">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-3">
            <Link
              className="text-sm font-semibold text-emerald-900 hover:underline"
              href="/multiplayer"
            >
              Retour au lobby
            </Link>
            <Link className="text-sm font-semibold text-emerald-900 hover:underline" href="/">
              Retour au jeu
            </Link>
          </div>
          <AuthStatus />
        </header>

        {pageState === "unavailable" ? (
          <StatusMessage>Supabase est indisponible. Vérifie .env.local.</StatusMessage>
        ) : null}

        {pageState === "signed-out" ? (
          <StatusMessage>
            Connecte-toi pour voir cette room.
            <Link
              className="mt-4 inline-flex rounded-md bg-emerald-800 px-3 py-2 text-sm font-semibold text-white"
              href="/login"
            >
              Se connecter
            </Link>
          </StatusMessage>
        ) : null}

        {pageState === "loading" ? <StatusMessage>Chargement de la room...</StatusMessage> : null}

        {pageState === "missing" ? (
          <StatusMessage>{error ?? "Room introuvable."}</StatusMessage>
        ) : null}

        {error && pageState === "ready" ? (
          <p className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900">
            {error}
          </p>
        ) : null}

        {pageState === "ready" && roomWithPlayers ? (
          <>
            <section className="rounded-lg border border-stone-300 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">
                    Room multijoueur
                  </p>
                  <h1 className="mt-1 font-mono text-3xl font-bold">
                    {roomWithPlayers.room.code}
                  </h1>
                  <p className="mt-2 text-sm text-stone-600">
                    Statut: {roomWithPlayers.room.status} | Mode:{" "}
                    {roomWithPlayers.room.scoring_mode} | Cible:{" "}
                    {roomWithPlayers.room.target_score}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    className="rounded-md border border-stone-300 bg-white px-3 py-2 text-sm font-semibold text-stone-800 hover:bg-stone-50"
                    onClick={() => loadRoom()}
                    type="button"
                  >
                    Rafraîchir
                  </button>
                  <button
                    className="rounded-md bg-emerald-800 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={!currentSeat || isUpdatingReady || roomWithPlayers.room.status !== "lobby"}
                    onClick={handleToggleReady}
                    type="button"
                  >
                    {currentSeat?.is_ready ? "Not ready" : "Ready"}
                  </button>
                </div>
              </div>

              {!currentSeat ? (
                <p className="mt-4 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                  Tu regardes cette room, mais ton utilisateur n&apos;occupe pas de siège.
                </p>
              ) : null}
            </section>

            <section className="rounded-lg border border-stone-300 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-bold">Sièges</h2>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {roomWithPlayers.players.map((player) => (
                  <SeatCard
                    isCurrentUser={player.user_id === session?.user.id}
                    key={player.id}
                    player={player}
                  />
                ))}
              </div>
            </section>
          </>
        ) : null}
      </div>
    </main>
  );
}

function SeatCard({
  isCurrentUser,
  player,
}: {
  isCurrentUser: boolean;
  player: RoomPlayerRow;
}) {
  return (
    <div className="rounded-lg border border-stone-200 bg-stone-50 p-4 text-sm">
      <div className="flex items-center justify-between gap-3">
        <p className="font-bold">Seat {player.seat_index}</p>
        {isCurrentUser ? (
          <span className="rounded-md bg-emerald-100 px-2 py-1 text-xs font-bold text-emerald-900">
            Toi
          </span>
        ) : null}
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-2 text-stone-700">
        <dt className="font-semibold">Kind</dt>
        <dd>{player.kind}</dd>
        <dt className="font-semibold">Nom</dt>
        <dd>{player.display_name ?? "-"}</dd>
        <dt className="font-semibold">Ready</dt>
        <dd>{player.is_ready ? "oui" : "non"}</dd>
        <dt className="font-semibold">Connected</dt>
        <dd>{player.is_connected ? "oui" : "non"}</dd>
      </dl>
    </div>
  );
}

function StatusMessage({ children }: { children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-stone-300 bg-white p-5 text-sm text-stone-700 shadow-sm">
      {children}
    </section>
  );
}
