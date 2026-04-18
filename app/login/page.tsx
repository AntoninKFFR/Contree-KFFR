"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import {
  cleanUsername,
  createProfile,
  getProfileUsername,
  isUniqueViolation,
  isUsernameTaken,
} from "@/lib/profiles";
import { getSupabaseClient } from "@/lib/supabaseClient";

type Notice = {
  tone: "error" | "success";
  text: string;
};

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [profileUsername, setProfileUsername] = useState<string | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const supabase = getSupabaseClient();

  useEffect(() => {
    if (!supabase) {
      setIsReady(true);
      return;
    }

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setIsReady(true);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });

    return () => subscription.unsubscribe();
  }, [supabase]);

  useEffect(() => {
    if (!supabase || !session) {
      setProfileUsername(null);
      return;
    }

    getProfileUsername(supabase, session.user.id).then(setProfileUsername);
  }, [session, supabase]);

  async function handleSignUp() {
    if (!supabase) return;

    const nextUsername = cleanUsername(username);

    if (!nextUsername) {
      setNotice({ tone: "error", text: "Choisis un pseudo pour créer ton compte." });
      return;
    }

    setIsSubmitting(true);
    setNotice(null);

    const usernameTaken = await isUsernameTaken(supabase, nextUsername);

    if (usernameTaken) {
      setIsSubmitting(false);
      setNotice({ tone: "error", text: "Ce pseudo est déjà pris." });
      return;
    }

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          username: nextUsername,
        },
      },
    });

    if (error) {
      setIsSubmitting(false);
      setNotice({ tone: "error", text: error.message });
      return;
    }

    if (data.user) {
      const { error: profileError } = await createProfile(supabase, data.user.id, nextUsername);

      if (profileError) {
        setIsSubmitting(false);

        if (isUniqueViolation(profileError.code)) {
          setNotice({ tone: "error", text: "Ce pseudo est déjà pris." });
          return;
        }

        setNotice({
          tone: "error",
          text: "Compte créé, mais le profil n'a pas pu être créé. Réessaie après connexion.",
        });
        return;
      }
    }

    setProfileUsername(nextUsername);
    setIsSubmitting(false);
    setNotice({
      tone: "success",
      text: "Compte créé. Vérifie tes emails si Supabase demande une confirmation.",
    });
  }

  async function handleCreateMissingProfile() {
    if (!supabase || !session) return;

    const nextUsername = cleanUsername(username);

    if (!nextUsername) {
      setNotice({ tone: "error", text: "Choisis un pseudo à enregistrer." });
      return;
    }

    setIsSubmitting(true);
    setNotice(null);

    const usernameTaken = await isUsernameTaken(supabase, nextUsername);

    if (usernameTaken) {
      setIsSubmitting(false);
      setNotice({ tone: "error", text: "Ce pseudo est déjà pris." });
      return;
    }

    const { error } = await createProfile(supabase, session.user.id, nextUsername);

    setIsSubmitting(false);

    if (error) {
      if (isUniqueViolation(error.code)) {
        setNotice({ tone: "error", text: "Ce pseudo est déjà pris." });
        return;
      }

      setNotice({ tone: "error", text: error.message });
      return;
    }

    setProfileUsername(nextUsername);
    setNotice({ tone: "success", text: "Pseudo enregistré." });
  }

  async function handleSignIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;

    setIsSubmitting(true);
    setNotice(null);

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    setIsSubmitting(false);

    if (error) {
      setNotice({ tone: "error", text: error.message });
      return;
    }

    if (data.session) {
      const nextUsername = await getProfileUsername(supabase, data.session.user.id);
      setProfileUsername(nextUsername);
    }

    setNotice({ tone: "success", text: "Connexion réussie." });
  }

  async function handleSignOut() {
    if (!supabase) return;

    setIsSubmitting(true);
    setNotice(null);

    const { error } = await supabase.auth.signOut();

    setIsSubmitting(false);
    setProfileUsername(null);

    if (error) {
      setNotice({ tone: "error", text: error.message });
      return;
    }

    setNotice({ tone: "success", text: "Déconnexion réussie." });
  }

  const sessionLabel = session
    ? `Connecté avec ${profileUsername ?? "profil sans pseudo"}`
    : "Non connecté";

  return (
    <main className="min-h-dvh bg-[#f4f1e8] px-4 py-6 text-stone-950">
      <div className="mx-auto flex max-w-md flex-col gap-5">
        <Link className="text-sm font-semibold text-emerald-900 hover:underline" href="/">
          Retour au jeu
        </Link>

        <section className="rounded-lg border border-stone-300 bg-white p-5 shadow-sm">
          <div className="mb-5 flex flex-col gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">
              Compte joueur
            </p>
            <h1 className="text-2xl font-bold">Connexion</h1>
            <p className="text-sm font-semibold text-stone-700">{sessionLabel}</p>
          </div>

          {!supabase ? (
            <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              Supabase n&apos;est pas encore configuré. Vérifie les valeurs dans .env.local.
            </p>
          ) : null}

          <form className="flex flex-col gap-3" onSubmit={handleSignIn}>
            <label className="flex flex-col gap-1 text-sm font-semibold">
              Email
              <input
                className="rounded-md border border-stone-300 px-3 py-2 font-normal"
                disabled={!supabase || isSubmitting}
                onChange={(event) => setEmail(event.target.value)}
                required
                type="email"
                value={email}
              />
            </label>

            <label className="flex flex-col gap-1 text-sm font-semibold">
              Mot de passe
              <input
                className="rounded-md border border-stone-300 px-3 py-2 font-normal"
                disabled={!supabase || isSubmitting}
                minLength={6}
                onChange={(event) => setPassword(event.target.value)}
                required
                type="password"
                value={password}
              />
            </label>

            <label className="flex flex-col gap-1 text-sm font-semibold">
              Pseudo
              <input
                className="rounded-md border border-stone-300 px-3 py-2 font-normal"
                disabled={!supabase || isSubmitting}
                onChange={(event) => setUsername(event.target.value)}
                placeholder="Ton pseudo"
                type="text"
                value={username}
              />
            </label>

            <div className="grid gap-2 sm:grid-cols-2">
              <button
                className="rounded-md bg-emerald-800 px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                disabled={!supabase || isSubmitting || !isReady}
                type="submit"
              >
                Se connecter
              </button>
              <button
                className="rounded-md border border-emerald-800 bg-white px-3 py-2 text-sm font-semibold text-emerald-900 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={!supabase || isSubmitting || !isReady}
                onClick={handleSignUp}
                type="button"
              >
                Créer un compte
              </button>
            </div>
          </form>

          {session ? (
            <button
              className="mt-3 w-full rounded-md border border-stone-400 bg-stone-100 px-3 py-2 text-sm font-semibold text-stone-900 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isSubmitting}
              onClick={handleSignOut}
              type="button"
            >
              Se déconnecter
            </button>
          ) : null}

          {session && !profileUsername ? (
            <button
              className="mt-3 w-full rounded-md border border-emerald-800 bg-white px-3 py-2 text-sm font-semibold text-emerald-900 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={!supabase || isSubmitting || !isReady}
              onClick={handleCreateMissingProfile}
              type="button"
            >
              Enregistrer le pseudo
            </button>
          ) : null}

          {notice ? (
            <p
              className={`mt-4 rounded-md border px-3 py-2 text-sm ${
                notice.tone === "error"
                  ? "border-red-300 bg-red-50 text-red-900"
                  : "border-emerald-300 bg-emerald-50 text-emerald-900"
              }`}
            >
              {notice.text}
            </p>
          ) : null}
        </section>
      </div>
    </main>
  );
}
