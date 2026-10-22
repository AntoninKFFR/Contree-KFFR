import type { Session } from "@supabase/supabase-js";
// Opt-in disposable LOCAL integration only. Metro never imports this harness.
const value = (globalThis as unknown as { __nativeLocalBackend?: { url: string; key: string; session: Session } }).__nativeLocalBackend;
if (value && !["127.0.0.1", "localhost"].includes(new URL(value.url).hostname)) throw new Error("Native integration harness requires loopback Supabase");
export const localBackend = value;
