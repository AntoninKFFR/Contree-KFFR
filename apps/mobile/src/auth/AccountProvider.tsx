import type { SupabaseClient } from "@supabase/supabase-js";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { AppState } from "react-native";
import { createAccountController, initialAccountState, type AccountState } from "@/lib/account";
import { supabase } from "@/lib/supabase";

type AccountContextValue = AccountState & {
  configured: boolean;
  navigationIdentity: string | null;
  reload: () => void;
  signIn: (email: string, password: string) => Promise<boolean>;
  signOut: () => void;
};
const AccountContext = createContext<AccountContextValue | null>(null);

export function AccountProvider({ children, client = supabase }: { children: ReactNode; client?: SupabaseClient | null }) {
  const [value, setValue] = useState({ state: initialAccountState, navigationIdentity: null as string | null });
  const account = useRef<ReturnType<typeof createAccountController> | null>(null);
  useEffect(() => {
    if (!client) return;
    const controller = createAccountController(client, (state) => {
      setValue((previous) => ({
        state,
        // Retain navigation during revalidation, never private screen data.
        // A logout, including an incomplete one, removes its history.
        navigationIdentity: state.session?.user.id ??
          (state.signOutIncomplete || (!state.loading && !state.signOutRequired) ? null : previous.navigationIdentity),
      }));
    });
    account.current = controller;
    controller.setForeground(AppState.currentState === "active");
    const listener = AppState.addEventListener("change", (next) => controller.setForeground(next === "active"));
    return () => {
      listener.remove();
      controller.dispose();
      account.current = null;
    };
  }, [client]);
  return (
    <AccountContext.Provider value={{
      ...value.state, configured: Boolean(client), navigationIdentity: value.navigationIdentity,
      reload: () => { void account.current?.reload(); },
      signIn: async (email, password) => (await account.current?.signIn(email, password)) ?? false,
      signOut: () => { void account.current?.signOut(); },
    }}>{children}</AccountContext.Provider>
  );
}
export function useAccount() {
  const account = useContext(AccountContext);
  if (!account) throw new Error("useAccount requires AccountProvider");
  return account;
}
