import type { SupabaseClient } from "@supabase/supabase-js";

export function safeNextPath(value: string | null | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\") || /[\u0000-\u001f]/.test(value)) return "/";
  try {
    const decoded = decodeURIComponent(value);
    if (decoded.startsWith("//") || decoded.includes("\\") || /[\u0000-\u001f]/.test(decoded)) return "/";
    const url = new URL(value, "https://kffr.invalid");
    if (url.origin !== "https://kffr.invalid") return "/";
    if (url.pathname === "/login" || url.pathname === "/auth/callback") return "/";
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return "/";
  }
}

export function loginPath(next: string): string {
  return `/login?next=${encodeURIComponent(safeNextPath(next))}`;
}

export function authCallbackUrl(origin: string, next: string): string {
  const callback = new URL("/auth/callback", origin);
  callback.searchParams.set("next", safeNextPath(next));
  return callback.toString();
}

export async function signInWithGoogle(supabase: SupabaseClient, origin: string, next: string): Promise<boolean> {
  try {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: authCallbackUrl(origin, next) },
    });
    return !error;
  } catch {
    return false;
  }
}

export function signupNextStep(hasSession: boolean, hasUsername: boolean, next: string):
  { kind: "redirect"; path: string } | { kind: "confirm" } {
  if (!hasSession) return { kind: "confirm" };
  return { kind: "redirect", path: hasUsername ? safeNextPath(next) : "/profile" };
}
