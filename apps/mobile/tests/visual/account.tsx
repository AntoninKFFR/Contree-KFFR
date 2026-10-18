import { createContext, useContext } from "react";
import type { AccountState } from "../../src/lib/account";
export type VisualAccount = AccountState & { configured: boolean; reload: () => void; signOut: () => void; signIn: (email: string, password: string) => Promise<boolean> };
export const VisualAccountContext = createContext<VisualAccount | null>(null);
export function useAccount() { const value = useContext(VisualAccountContext); if (!value) throw new Error("Missing visual fixture"); return value; }
