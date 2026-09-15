"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { getProfileUsername } from "@/lib/profiles";
import { createMultiplayerRoom, findMultiplayerRoom } from "@/lib/multiplayerApi";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { RulesetConfigurator } from "@/components/rules/RulesetConfigurator";
import { RulesetSummary } from "@/components/rules/RulesetSummary";
import { AccessibleDialog } from "@/components/ui/AccessibleDialog";
import { PlayerSettingsDialog } from "@/components/settings/PlayerSettingsPanel";
import { buildCustomRuleset, type CustomRulesetInput } from "@/engine/rulesets/custom";
import { AppEyebrow, AppPage, AppSurface, appInputClass, appPrimaryActionClass, appSecondaryActionClass } from "@/components/ui/AppShell";

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
  const [session, setSession] = useState<Session | null>(null);
  const [rules, setRules] = useState<CustomRulesetInput>({ presetId: "contree-kffr" });
  const [isRulesOpen, setIsRulesOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

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
      const result = await createMultiplayerRoom({
        displayName,
        rules,
      }, session);

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
      const result = await findMultiplayerRoom(roomCode, session);

      router.push(`/multiplayer/${result.room.id}`);
    } catch (error) {
      setNotice({ tone: "error", text: errorMessage(error) });
    } finally {
      setIsSubmitting(false);
    }
  }

  const canSubmit = pageState === "ready" && !isSubmitting;

  return (
    <AppPage>
        <AppSurface className="flex items-start justify-between gap-4 bg-[radial-gradient(circle_at_top_right,rgb(37_128_84_/_20%),transparent_45%)]">
          <div><AppEyebrow>Multijoueur</AppEyebrow><h1 className="mt-1 text-3xl font-black tracking-tight text-[#f4ead0]">Une table, quatre places</h1><p className="mt-1 text-sm text-white/50">Crée la partie ou saisis un code.</p></div>
          <button className={appSecondaryActionClass} type="button" onClick={() => setIsSettingsOpen(true)}>Préférences</button>
        </AppSurface>

        {pageState === "unavailable" ? (
          <StatusMessage>Supabase est indisponible. Vérifie .env.local.</StatusMessage>
        ) : null}

        {pageState === "signed-out" ? (
          <StatusMessage>
            Connecte-toi pour créer ou rejoindre une table.
            <Link
              className={`${appPrimaryActionClass} mt-4`}
              href="/login"
            >
              Se connecter
            </Link>
          </StatusMessage>
        ) : null}

        {pageState === "loading" ? <StatusMessage>Chargement de la session...</StatusMessage> : null}

        {notice ? (
          <p
            className={`rounded-xl border px-3 py-2 text-sm font-semibold ${
              notice.tone === "error"
                ? "border-red-300/25 bg-red-950/45 text-red-100"
                : "border-emerald-300/25 bg-emerald-950/45 text-emerald-100"
            }`}
          >
            {notice.text}
          </p>
        ) : null}

        {pageState === "ready" ? (
          <div className="grid items-start gap-4 lg:grid-cols-[1.15fr_0.85fr]">
            <AppSurface className="border-emerald-300/20 bg-[linear-gradient(145deg,rgb(18_58_42_/_94%),rgb(8_24_17_/_94%))] lg:p-6">
              <div className="flex items-center justify-between gap-3"><div><AppEyebrow>Nouvelle partie</AppEyebrow><h2 className="mt-1 text-2xl font-black text-[#f4ead0]">Créer une table</h2></div><span aria-hidden="true" className="text-3xl text-emerald-300/40">♣</span></div>
              <form className="mt-5 flex flex-col gap-3" onSubmit={handleCreateRoom}>
                <PlayerNameInput
                  disabled={!canSubmit}
                  onChange={setDisplayName}
                  value={displayName}
                />

                <RulesetSummary ruleset={buildCustomRuleset(rules)} compact showDifferences />
                <button className={appSecondaryActionClass} disabled={!canSubmit} type="button" onClick={() => setIsRulesOpen(true)}>Modifier les règles</button>

                <button
                  className={appPrimaryActionClass}
                  disabled={!canSubmit}
                  type="submit"
                >
                  Créer la table
                </button>
              </form>
            </AppSurface>

            <AppSurface className="lg:mt-8">
              <div><AppEyebrow>Invitation</AppEyebrow><h2 className="mt-1 text-xl font-black text-[#f4ead0]">Rejoindre une table</h2></div>
              <form className="mt-5 flex flex-col gap-3" onSubmit={handleJoinRoom}>
                <PlayerNameInput
                  disabled={!canSubmit}
                  onChange={setDisplayName}
                  value={displayName}
                />

                <label className="coinche-app-field flex flex-col gap-1.5 text-xs font-bold uppercase tracking-wide text-white/55">
                  Code de table
                  <input
                    className={`${appInputClass} text-center font-mono text-lg uppercase tracking-[0.22em]`}
                    disabled={!canSubmit}
                    maxLength={12}
                    onChange={(event) => setRoomCode(event.target.value.toUpperCase())}
                    required
                    value={roomCode}
                  />
                </label>

                <button
                  className={appSecondaryActionClass}
                  disabled={!canSubmit}
                  type="submit"
                >
                  Rejoindre la table
                </button>
              </form>
            </AppSurface>
          </div>
        ) : null}
        {isRulesOpen ? <AccessibleDialog footer={<button className={`${appPrimaryActionClass} w-full sm:w-auto`} type="button" onClick={() => setIsRulesOpen(false)}>Valider les règles</button>} onClose={() => setIsRulesOpen(false)} stableHeight title="Règles de la table"><RulesetConfigurator value={rules} onChange={setRules} /></AccessibleDialog> : null}
        {isSettingsOpen ? <PlayerSettingsDialog context={{ mode: "multiplayer", isHost: false }} onClose={() => setIsSettingsOpen(false)} /> : null}
    </AppPage>
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
    <label className="coinche-app-field flex flex-col gap-1.5 text-xs font-bold uppercase tracking-wide text-white/55">
      Nom affiché
      <input
        className={appInputClass}
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
    <AppSurface className="text-sm text-white/65">{children}</AppSurface>
  );
}
