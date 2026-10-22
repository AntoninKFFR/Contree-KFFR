import { createClient } from "@supabase/supabase-js";
import { localBackend } from "./local-backend";
// Live cross-renderer E2E uses the REAL SDK against a mocked localhost WebSocket.
// Static captures never open a socket. An explicit loopback-only configuration
// also supports integration with the real disposable local DB and Next server.
export const supabase = new URLSearchParams(location.search).get("multi") === "live"
  ? createClient(localBackend?.url ?? "http://127.0.0.1:54321", localBackend?.key ?? "fixture-public-key", { accessToken: async () => localBackend?.session.access_token ?? "fixture-token", auth: { persistSession: false } }) : null;
