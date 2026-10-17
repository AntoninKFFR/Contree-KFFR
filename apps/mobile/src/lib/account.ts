import type { Session, SupabaseClient } from "@supabase/supabase-js";

export type AccountState = {
  session: Session | null;
  username: string | null;
  loading: boolean;
  submitting: boolean;
  signOutRequired: boolean;
  signOutIncomplete: boolean;
  error: string | null;
};

export const initialAccountState: AccountState = {
  session: null, username: null, loading: true, submitting: false,
  signOutRequired: false, signOutIncomplete: false, error: null,
};

/** Owns asynchronous account reads. Every auth/lifecycle change invalidates older reads. */
export function createAccountController(client: SupabaseClient, onChange: (state: AccountState) => void) {
  let state = initialAccountState;
  let disposed = false;
  let revision = 0;
  let foreground = true;
  let signingOut = false;

  function update(patch: Partial<AccountState>) {
    state = { ...state, ...patch };
    if (!disposed) onChange(state);
  }

  async function read(session: Session | null, request: number) {
    const current = () => !disposed && foreground && !signingOut && request === revision;
    if (!current()) return;
    if (!session) {
      update({ session: null, username: null, loading: false });
      return;
    }
    try {
      // A stored session alone is not proof of a valid identity. Ask Auth first.
      const { data: identity, error: authError } = await client.auth.getUser(session.access_token);
      if (!current()) return;
      if (authError || identity.user?.id !== session.user.id) {
        update({ session: null, username: null, loading: false, signOutRequired: true,
          error: "Session non vérifiée. Réessaie avec du réseau ou déconnecte cet appareil." });
        return;
      }
      const { data, error } = await client.from("profiles").select("username")
        .eq("id", identity.user.id).maybeSingle<{ username: string | null }>();
      if (!current()) return;
      update({ session, username: error ? null : data?.username ?? null, loading: false,
        error: error ? "Impossible de charger ton pseudo. Réessaie." : null });
    } catch {
      if (current()) update({ session: null, username: null, loading: false,
        signOutRequired: true, error: "Connexion au serveur impossible. Vérifie ton réseau et réessaie." });
    }
  }

  async function reload() {
    if (disposed || signingOut || !foreground) return;
    const request = ++revision;
    update({ session: null, username: null, loading: true, error: null, signOutRequired: false });
    try {
      const { data, error } = await client.auth.getSession();
      if (request !== revision || disposed) return;
      if (error) throw error;
      await read(data.session, request);
    } catch {
      if (request === revision && !disposed) update({ loading: false, signOutRequired: true,
        error: "Session indisponible. Vérifie ton réseau et réessaie." });
    }
  }

  const { data: { subscription } } = client.auth.onAuthStateChange((_event, session) => {
    if (disposed || signingOut) return;
    const request = ++revision;
    update({ session: null, username: null, loading: foreground && Boolean(session),
      error: null, signOutRequired: false });
    // Keep Auth I/O outside its event callback, including refresh-triggered reads.
    setTimeout(() => { void read(session, request); }, 0);
  });
  void reload();

  return {
    reload,
    setForeground(active: boolean) {
      foreground = active;
      if (active) {
        if (!signingOut) client.auth.startAutoRefresh();
        void reload();
      } else {
        ++revision;
        client.auth.stopAutoRefresh();
        update({ session: null, username: null, loading: !signingOut });
      }
    },
    async signIn(email: string, password: string) {
      if (state.submitting || signingOut || disposed) return false;
      if (!email.trim() || !password) {
        update({ error: "Renseigne ton email et ton mot de passe." });
        return false;
      }
      update({ submitting: true, error: null });
      try {
        const { error } = await client.auth.signInWithPassword({ email: email.trim(), password });
        if (error) {
          update({ error: error.status === 400 ? "Connexion refusée. Vérifie tes identifiants."
            : "Connexion impossible. Vérifie ton réseau et réessaie." });
          return false;
        }
        return true;
      } catch {
        update({ error: "Connexion impossible. Vérifie ton réseau et réessaie." });
        return false;
      } finally {
        update({ submitting: false });
      }
    },
    async signOut() {
      if (state.submitting || disposed) return;
      signingOut = true;
      ++revision;
      client.auth.stopAutoRefresh();
      // Hide private data immediately, even when revocation fails offline.
      update({ session: null, username: null, loading: false, submitting: true,
        signOutRequired: true, signOutIncomplete: true, error: null });
      try {
        const { error } = await client.auth.signOut({ scope: "local" });
        if (error) throw error;
        signingOut = false;
        update({ signOutRequired: false, signOutIncomplete: false });
        if (foreground && !disposed) client.auth.startAutoRefresh();
      } catch {
        update({ error: "Déconnexion incomplète. Rétablis le réseau puis réessaie." });
      } finally {
        update({ submitting: false });
      }
    },
    dispose() {
      disposed = true;
      ++revision;
      subscription.unsubscribe();
      client.auth.stopAutoRefresh();
    },
  };
}
