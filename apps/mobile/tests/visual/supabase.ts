import { createClient } from "@supabase/supabase-js";
// Live cross-renderer E2E uses the REAL SDK against a mocked localhost WebSocket.
// Static captures never open a socket. Neither case can reach a real database.
export const supabase = new URLSearchParams(location.search).get("multi") === "live"
  ? createClient("http://127.0.0.1:54321", "fixture-public-key", { accessToken: async () => "fixture-token", auth: { persistSession: false } }) : null;
