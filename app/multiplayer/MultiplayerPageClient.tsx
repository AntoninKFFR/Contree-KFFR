"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { getProfileUsername } from "@/lib/profiles";
import { createRoom, joinRoom } from "@/lib/rooms";
import { getSupabaseClient } from "@/lib/supabaseClient";
import type { ScoringMode } from "@/engine/types";

type PageState = "loading" | "ready" | "signed-out" | "unavailable";

type Notice = {
  tone: "error" | "success";
  text: string;
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Action impossible pour le moment.";
}

export default function MultiplayerPage() {
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [pageState, setPageState] = useState<PageState>("loading");
  const [roomCode, setRoomCode] = useState("");
  const [scoringMode, setScoringMode] = useState<ScoringMode>("made-points");
  const [session, setSession] = useState<Session | null>(null);
  const [targetScore, setTargetScore] = useState(1000);

  useEffect(() => {
    const supabase = getSupabaseClient();

    if (!supabase) {
      setPageState("unavailable");
      return;
    }

    const client = supabase;
    let isCancelled = false;

    async function loadSession() {
      setPageState("loading");
      const { data } = await client.auth.getSession();

      if (isCancelled) return;

      const nextSession = data.session;
      setSession(nextSession);

      if (!nextSession) {
        setPageState("signed-out");
        return;
      }

      const username = await getProfileUsername(client, nextSession.user.id);

      if (isCancelled) return;

      setDisplayName(username ?? nextSession.user.email?.split("@")[0] ?? "");
      setPageState("ready");
    }

    loadSession();

    const {
      data: { subscription },
    } = client.auth.onAuthStateChange(() => {
      loadSession();
    });

    return () => {
      isCancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  async function handleCreateRoom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const supabase = getSupabaseClient();

    if (!supabase || !session) return;

    setIsSubmitting(true);
    setNotice(null);

    try {
      const result = await createRoom(supabase, {
        hostDisplayName: displayName,
        hostUserId: session.user.id,
        scoringMode,
        targetScore,
      });

      router.push(`/multiplayer/${result.room.id}`);
    } catch (error) {
      setNotice({ tone: "error", text: errorMessage(error) });
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleJoinRoom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const supabase = getSupabaseClient();

    if (!supabase || !session) return;

    setIsSubmitting(true);
    setNotice(null);

    try {
      const result = await joinRoom(supabase, {
        code: roomCode,
        displayName,
        userId: session.user.id,
      });

      router.push(`/multiplayer/${result.room.id}`);
    } catch (error) {
      setNotice({ tone: "error", text: errorMessage(error) });
    } finally {
      setIsSubmitting(false);
    }
  }

  const canSubmit = pageState === "ready" && !isSubmitting;

  return (
    <main className="min-h-dvh bg-[#f4f1e8] px-4 py-6 text-stone-950">
      <div className="mx-auto flex max-w-4xl flex-col gap-4">
        <section className="rounded-lg border border-stone-300 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">
            Multijoueur
          </p>
          <h1 className="mt-1 text-2xl font-bold">Tables</h1>
          <p className="mt-1 text-sm text-stone-600">
            Crée une table ou rejoins une table avec un code.
          </p>
        </section>

        {pageState === "unavailable" ? (
          <StatusMessage>Supabase est indisponible. Vérifie .env.local.</StatusMessage>
        ) : null}

        {pageState === "signed-out" ? (
          <StatusMessage>
            Connecte-toi pour créer ou rejoindre une table.
            <Link
              className="mt-4 inline-flex rounded-md bg-emerald-800 px-3 py-2 text-sm font-semibold text-white"
              href="/login"
            >
              Se connecter
            </Link>
          </StatusMessage>
        ) : null}

        {pageState === "loading" ? <StatusMessage>Chargement de la session...</StatusMessage> : null}

        {notice ? (
          <p
            className={`rounded-md border px-3 py-2 text-sm ${
              notice.tone === "error"
                ? "border-red-300 bg-red-50 text-red-900"
                : "border-emerald-300 bg-emerald-50 text-emerald-900"
            }`}
          >
            {notice.text}
          </p>
        ) : null}

        {pageState === "ready" ? (
          <div className="grid gap-4 lg:grid-cols-2">
            <section className="rounded-lg border border-stone-300 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-bold">Créer une table</h2>
              <form className="mt-4 flex flex-col gap-3" onSubmit={handleCreateRoom}>
                <PlayerNameInput
                  disabled={!canSubmit}
                  onChange={setDisplayName}
                  value={displayName}
                />

                <label className="flex flex-col gap-1 text-sm font-semibold">
                  Mode de score
                  <select
                    className="rounded-md border border-stone-300 px-3 py-2 font-normal"
                    disabled={!canSubmit}
                    onChange={(event) => setScoringMode(event.target.value as ScoringMode)}
                    value={scoringMode}
                  >
                    <option value="made-points">Points faits</option>
                    <option value="announced-points">Points annonces</option>
                  </select>
                </label>

                <label className="flex flex-col gap-1 text-sm font-semibold">
                  Score cible
                  <input
                    className="rounded-md border border-stone-300 px-3 py-2 font-normal"
                    disabled={!canSubmit}
                    min={1}
                    onChange={(event) => setTargetScore(Number(event.target.value))}
                    required
                    type="number"
                    value={targetScore}
                  />
                </label>

                <button
                  className="rounded-md bg-emerald-800 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={!canSubmit}
                  type="submit"
                >
                  Créer la table
                </button>
              </form>
            </section>

            <section className="rounded-lg border border-stone-300 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-bold">Rejoindre une table</h2>
              <form className="mt-4 flex flex-col gap-3" onSubmit={handleJoinRoom}>
                <PlayerNameInput
                  disabled={!canSubmit}
                  onChange={setDisplayName}
                  value={displayName}
                />

                <label className="flex flex-col gap-1 text-sm font-semibold">
                  Code de table
                  <input
                    className="rounded-md border border-stone-300 px-3 py-2 font-mono uppercase"
                    disabled={!canSubmit}
                    maxLength={12}
                    onChange={(event) => setRoomCode(event.target.value.toUpperCase())}
                    required
                    value={roomCode}
                  />
                </label>

                <button
                  className="rounded-md bg-stone-900 px-3 py-2 text-sm font-semibold text-white hover:bg-stone-700 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={!canSubmit}
                  type="submit"
                >
                  Rejoindre la table
                </button>
              </form>
            </section>
          </div>
        ) : null}
      </div>
    </main>
  );
}

function PlayerNameInput({
  disabled,
  onChange,
  value,
}: {
  disabled: boolean;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm font-semibold">
      Nom affiché
      <input
        className="rounded-md border border-stone-300 px-3 py-2 font-normal"
        disabled={disabled}
        maxLength={40}
        onChange={(event) => onChange(event.target.value)}
        required
        value={value}
      />
    </label>
  );
}

function StatusMessage({ children }: { children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-stone-300 bg-white p-5 text-sm text-stone-700 shadow-sm">
      {children}
    </section>
  );
}
