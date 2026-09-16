import type { SupabaseClient, User } from "@supabase/supabase-js";

export type Profile = { id: string; username: string | null };
export const PROFILE_CHANGED_EVENT = "kffr:profile-changed";
export const MAX_USERNAME_LENGTH = 40;

export function cleanUsername(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function validateUsername(value: string): string | null {
  const username = cleanUsername(value);
  if (!username) return "Choisis un pseudo.";
  if (username.length > MAX_USERNAME_LENGTH) return `Le pseudo ne peut pas dépasser ${MAX_USERNAME_LENGTH} caractères.`;
  if (/[\u0000-\u001f\u007f]/.test(username)) return "Ce pseudo contient des caractères non autorisés.";
  return null;
}

export function isUniqueViolation(code?: string): boolean {
  return code === "23505";
}

export function profileErrorMessage(error: { code?: string; message?: string } | null): string {
  if (isUniqueViolation(error?.code) || /duplicate key|already exists|already registered/i.test(error?.message ?? "")) {
    return "Ce pseudo est déjà pris.";
  }
  return "Impossible d’enregistrer le pseudo pour le moment. Réessaie.";
}

export function notifyProfileChanged(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(PROFILE_CHANGED_EVENT));
}

export async function getProfileUsername(supabase: SupabaseClient, userId: string): Promise<string | null> {
  const { data, error } = await supabase.from("profiles").select("username").eq("id", userId).maybeSingle<Pick<Profile, "username">>();
  if (error) return null;
  return data?.username ?? null;
}

export async function isUsernameTaken(supabase: SupabaseClient, username: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("is_username_taken", { p_username: cleanUsername(username) });
  if (error) throw error;
  return data === true;
}

export async function createProfile(supabase: SupabaseClient, userId: string, username: string) {
  return supabase.from("profiles").insert({ id: userId, username: cleanUsername(username) });
}

export async function ensureProfile(supabase: SupabaseClient, user: User): Promise<string | null> {
  const existing = await getProfileUsername(supabase, user.id);
  if (existing) return existing;
  const candidate = typeof user.user_metadata?.username === "string" ? cleanUsername(user.user_metadata.username) : "";
  if (validateUsername(candidate)) return null;
  const result = await saveProfileUsername(supabase, user.id, candidate);
  return result.username;
}

export async function saveProfileUsername(supabase: SupabaseClient, userId: string, value: string) {
  const validationError = validateUsername(value);
  if (validationError) return { username: null, error: validationError };
  const username = cleanUsername(value);
  const { data, error } = await supabase.from("profiles").update({ username }).eq("id", userId).select("username").single<Pick<Profile, "username">>();
  if (error?.code === "PGRST116") {
    const { error: createError } = await createProfile(supabase, userId, username);
    if (createError) return { username: null, error: profileErrorMessage(createError) };
    notifyProfileChanged();
    return { username, error: null };
  }
  if (error) return { username: null, error: profileErrorMessage(error) };
  notifyProfileChanged();
  return { username: data.username, error: null };
}
