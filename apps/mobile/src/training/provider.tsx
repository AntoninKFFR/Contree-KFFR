import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useAccount } from "@/auth/AccountProvider";
import { supabase } from "@/lib/supabase";
import type { TrainingProgress } from "@/lib/training/progress";
import type { AccountTrainingRecord } from "@/lib/training/records";
import { TrainingProgressStore } from "./storage";
import { readTrainingRecords } from "./api";
const Context = createContext<{
  store: TrainingProgressStore; progress: TrainingProgress | null; error: string | null;
  records: AccountTrainingRecord[]; recordsError: string | null; refresh: () => void;
} | null>(null);
export function TrainingProvider({ children, userId }: { children: ReactNode; userId: string }) {
  const { session } = useAccount();
  const store = useMemo(() => new TrainingProgressStore(AsyncStorage, userId), [userId]);
  const [progress, setProgress] = useState<TrainingProgress | null>(null), [error, setError] = useState<string | null>(null);
  const [records, setRecords] = useState<AccountTrainingRecord[]>([]), [recordsError, setRecordsError] = useState<string | null>(null);
  const [epoch, setEpoch] = useState(0);
  useEffect(() => {
    let active = true;
    void store.load().then((p) => { if (active) { setProgress(p); setError(null); } }).catch((e: Error) => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [store, epoch]);
  useEffect(() => {
    const abort = new AbortController();
    if (supabase && session?.user.id === userId) void readTrainingRecords(supabase, userId, abort.signal).then((r) => { if (!abort.signal.aborted) { setRecords(r); setRecordsError(null); } }).catch((e: Error) => { if (!abort.signal.aborted) setRecordsError(e.message); });
    return () => abort.abort();
  }, [userId, session?.access_token, epoch, session?.user.id]);
  return <Context.Provider value={{ store, progress, error, records, recordsError, refresh: () => setEpoch((e) => e + 1) }}>{children}</Context.Provider>;
}
export function useTraining() { const c = useContext(Context); if (!c) throw Error("TrainingProvider requis"); return c; }

