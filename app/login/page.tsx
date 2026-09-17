"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { authCallbackUrl, safeNextPath, signInWithGoogle, signupNextStep } from "@/lib/authRedirect";
import { cleanUsername, ensureProfile, getProfileUsername, isUsernameTaken, profileErrorMessage, validateUsername } from "@/lib/profiles";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { AppEyebrow, AppPage, AppSurface, appInputClass, appPrimaryActionClass, appSecondaryActionClass } from "@/components/ui/AppShell";

type Mode = "signin" | "signup";
type Notice = { tone: "error" | "success"; text: string };

function authErrorMessage(message: string): string {
  if (/invalid login credentials|invalid credentials/i.test(message)) return "Email ou mot de passe incorrect.";
  if (/already registered|already exists|email.*in use/i.test(message)) return "Cet email est déjà utilisé.";
  return "L’authentification a échoué. Réessaie.";
}

export default function LoginPage() {
  const router = useRouter();
  const supabase = getSupabaseClient();
  const [mode, setMode] = useState<Mode>("signin");
  const [nextPath, setNextPath] = useState("/");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [username, setUsername] = useState("");
  const [profileUsername, setProfileUsername] = useState<string | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [confirmationEmail, setConfirmationEmail] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGoogleRedirecting, setIsGoogleRedirecting] = useState(false);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    setNextPath(safeNextPath(new URLSearchParams(window.location.search).get("next")));
    if (!supabase) { setIsReady(true); return; }
    let cancelled = false;
    supabase.auth.getSession().then(async ({ data }) => {
      if (cancelled) return;
      setSession(data.session);
      if (data.session) setProfileUsername(await getProfileUsername(supabase, data.session.user.id));
      if (!cancelled) setIsReady(true);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      if (nextSession) getProfileUsername(supabase, nextSession.user.id).then((name) => { if (!cancelled) setProfileUsername(name); });
      else setProfileUsername(null);
    });
    return () => { cancelled = true; subscription.unsubscribe(); };
  }, [supabase]);

  async function handleSignIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;
    setIsSubmitting(true); setNotice(null);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error || !data.session) { setNotice({ tone: "error", text: authErrorMessage(error?.message ?? "") }); return; }
      const resolved = await ensureProfile(supabase, data.session.user);
      router.replace(resolved ? nextPath : "/profile");
    } catch {
      setNotice({ tone: "error", text: "Connexion impossible pour le moment. Réessaie." });
    } finally { setIsSubmitting(false); }
  }

  async function handleSignUp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;
    const validationError = validateUsername(username);
    if (validationError) { setNotice({ tone: "error", text: validationError }); return; }
    if (password !== confirmation) { setNotice({ tone: "error", text: "Les mots de passe ne correspondent pas." }); return; }
    setIsSubmitting(true); setNotice(null);
    const nextUsername = cleanUsername(username);
    try {
      if (await isUsernameTaken(supabase, nextUsername)) { setNotice({ tone: "error", text: "Ce pseudo est déjà pris." }); return; }
      const { data, error } = await supabase.auth.signUp({
        email, password,
        options: { data: { username: nextUsername }, emailRedirectTo: authCallbackUrl(window.location.origin, nextPath) },
      });
      if (error) {
        const taken = await isUsernameTaken(supabase, nextUsername).catch(() => false);
        setNotice({ tone: "error", text: taken ? "Ce pseudo est déjà pris." : authErrorMessage(error.message) });
        return;
      }
      if (!data.user || data.user.identities?.length === 0) {
        setNotice({ tone: "error", text: "Cet email est déjà utilisé." });
        return;
      }
      const resolved = data.session?.user ? await ensureProfile(supabase, data.session.user) : null;
      const nextStep = signupNextStep(Boolean(data.session), Boolean(resolved), nextPath);
      if (nextStep.kind === "redirect") router.replace(nextStep.path);
      else {
        setConfirmationEmail(email);
      }
    } catch (error) {
      setNotice({ tone: "error", text: profileErrorMessage(error instanceof Error ? error : null) });
    } finally { setIsSubmitting(false); }
  }

  async function handleGoogleSignIn() {
    if (!supabase || isSubmitting) return;
    setIsSubmitting(true);
    setIsGoogleRedirecting(true);
    setNotice(null);
    if (await signInWithGoogle(supabase, window.location.origin, nextPath)) return;
    setNotice({ tone: "error", text: "Connexion Google impossible. Réessaie." });
    setIsGoogleRedirecting(false);
    setIsSubmitting(false);
  }

  async function handleSignOut() {
    if (!supabase) return;
    setIsSubmitting(true); setNotice(null);
    const { error } = await supabase.auth.signOut();
    setIsSubmitting(false);
    if (error) setNotice({ tone: "error", text: "Déconnexion impossible pour le moment." });
    else { setSession(null); setProfileUsername(null); }
  }

  return <AppPage width="narrow"><div className="flex flex-col gap-5">
    <Link className="coinche-ui-link w-fit text-sm font-semibold transition hover:underline" href="/">← Accueil</Link>
    <AppSurface className="p-5 sm:p-7">
      <AppEyebrow>Compte joueur</AppEyebrow>
      {!supabase ? <p className="mt-4 text-sm text-amber-100">Supabase n’est pas configuré. Vérifie .env.local.</p> : null}
      {!isReady ? <p className="mt-4 text-sm text-stone-300">Chargement de la session…</p> : null}

      {isReady && confirmationEmail ? <div className="mt-3 space-y-3">
        <h1 className="text-3xl font-black text-stone-50">Compte créé</h1>
        <p className="text-sm text-stone-300">Un email de confirmation a été envoyé à {confirmationEmail}. Ouvre son lien pour terminer l’inscription.</p>
      </div> : null}

      {isReady && session && !confirmationEmail ? <div className="mt-3 space-y-4">
        <h1 className="text-3xl font-black text-stone-50">Ton compte</h1>
        <p className="text-sm text-stone-300">Connecté en tant que <strong>{profileUsername ?? "profil sans pseudo"}</strong>.</p>
        <div className="flex flex-wrap gap-2">
          <Link className={appPrimaryActionClass} href={profileUsername ? nextPath : "/profile"}>{profileUsername ? "Continuer" : "Choisir un pseudo"}</Link>
          <button className={appSecondaryActionClass} disabled={isSubmitting} onClick={handleSignOut} type="button">Se déconnecter</button>
        </div>
      </div> : null}

      {isReady && !session && !confirmationEmail ? <>
        <h1 className="mt-2 text-3xl font-black tracking-tight text-stone-50">{mode === "signin" ? "Connexion" : "Créer un compte"}</h1>
        <div aria-label="Mode d’authentification" className="mt-5 grid grid-cols-2 gap-2">
          <button aria-pressed={mode === "signin"} className={mode === "signin" ? appPrimaryActionClass : appSecondaryActionClass} onClick={() => { setMode("signin"); setNotice(null); }} type="button">Se connecter</button>
          <button aria-pressed={mode === "signup"} className={mode === "signup" ? appPrimaryActionClass : appSecondaryActionClass} onClick={() => { setMode("signup"); setNotice(null); }} type="button">Créer un compte</button>
        </div>
        <form className="mt-5 flex flex-col gap-3" onSubmit={mode === "signin" ? handleSignIn : handleSignUp}>
          <button className="inline-flex min-h-11 w-full items-center justify-center gap-3 rounded-xl border border-[color:var(--border-strong)] bg-[color:var(--surface-raised)] px-4 py-2.5 text-sm font-bold text-[color:var(--text-primary)] shadow-sm transition hover:bg-[color:var(--surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--focus-ring)] disabled:cursor-not-allowed disabled:opacity-50" disabled={!supabase || isSubmitting} onClick={() => void handleGoogleSignIn()} type="button"><GoogleMark />{isGoogleRedirecting ? "Redirection…" : "Continuer avec Google"}</button>
          <div aria-label="ou" className="flex items-center gap-3 py-1 text-xs font-semibold uppercase tracking-wide text-[color:var(--text-secondary)]" role="separator"><span aria-hidden="true" className="h-px flex-1 bg-[color:var(--border)]" /><span>ou</span><span aria-hidden="true" className="h-px flex-1 bg-[color:var(--border)]" /></div>
          {mode === "signup" ? <label className="flex flex-col gap-1.5 text-sm font-semibold text-stone-200">Pseudo<input className={appInputClass} disabled={!supabase || isSubmitting} maxLength={40} onChange={(event) => setUsername(event.target.value)} required value={username} /></label> : null}
          <label className="flex flex-col gap-1.5 text-sm font-semibold text-stone-200">Email<input className={appInputClass} disabled={!supabase || isSubmitting} onChange={(event) => setEmail(event.target.value)} required type="email" value={email} /></label>
          <label className="flex flex-col gap-1.5 text-sm font-semibold text-stone-200">Mot de passe<input className={appInputClass} disabled={!supabase || isSubmitting} minLength={6} onChange={(event) => setPassword(event.target.value)} required type="password" value={password} /></label>
          {mode === "signup" ? <label className="flex flex-col gap-1.5 text-sm font-semibold text-stone-200">Confirmer le mot de passe<input className={appInputClass} disabled={!supabase || isSubmitting} minLength={6} onChange={(event) => setConfirmation(event.target.value)} required type="password" value={confirmation} /></label> : null}
          <button className={appPrimaryActionClass} disabled={!supabase || isSubmitting} type="submit">{isSubmitting ? "En cours…" : mode === "signin" ? "Se connecter" : "Créer mon compte"}</button>
        </form>
      </> : null}
      {notice ? <p role="alert" className={`mt-4 rounded-xl border px-3 py-2 text-sm ${notice.tone === "error" ? "border-red-300/35 bg-red-400/10 text-red-100" : "border-emerald-300/35 bg-emerald-300/10 text-emerald-100"}`}>{notice.text}</p> : null}
    </AppSurface>
  </div></AppPage>;
}

function GoogleMark() {
  return <svg aria-hidden="true" className="h-5 w-5 shrink-0" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5Z" />
    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.31 5.48-4.91 7.18l7.73 6C44.27 38.03 46.98 31.88 46.98 24.55Z" />
    <path fill="#FBBC05" d="M10.53 28.59A14.4 14.4 0 0 1 9.75 24c0-1.59.28-3.13.77-4.59l-7.98-6.2A23.9 23.9 0 0 0 0 24c0 3.87.93 7.52 2.56 10.78l7.97-6.19Z" />
    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.91-5.8l-7.73-6c-2.15 1.45-4.92 2.3-8.18 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48Z" />
  </svg>;
}
