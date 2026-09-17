import type { SupabaseClient } from "@supabase/supabase-js";
import { safeNextPath } from "@/lib/authRedirect";
import { ensureProfile } from "@/lib/profiles";

/** Shared completion path for email confirmation and Google OAuth callbacks. */
export async function completeAuthCallback(client: SupabaseClient, url: URL): Promise<string> {
  const hashParams = new URLSearchParams(url.hash.slice(1));
  if (url.searchParams.has("error") || hashParams.has("error") || hashParams.has("error_code")) {
    throw new Error("Auth provider returned an error");
  }
  const next = safeNextPath(url.searchParams.get("next"));
  const code = url.searchParams.get("code");
  let { data, error } = await client.auth.getSession();
  if (!data.session && code) {
    const { error: exchangeError } = await client.auth.exchangeCodeForSession(code);
    if (exchangeError) throw exchangeError;
    ({ data, error } = await client.auth.getSession());
  }
  if (error || !data.session) throw error ?? new Error("No session");
  const username = await ensureProfile(client, data.session.user);
  return username ? next : "/profile";
}
