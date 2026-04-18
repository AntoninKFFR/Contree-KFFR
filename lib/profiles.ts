import type { SupabaseClient } from "@supabase/supabase-js";

export type Profile = {
  id: string;
  username: string | null;
};

export function cleanUsername(username: string) {
  return username.trim();
}

export async function getProfileUsername(
  supabase: SupabaseClient,
  userId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("username")
    .eq("id", userId)
    .maybeSingle<Pick<Profile, "username">>();

  if (error) {
    return null;
  }

  return data?.username ?? null;
}

export async function isUsernameTaken(supabase: SupabaseClient, username: string) {
  const { data, error } = await supabase
    .from("profiles")
    .select("id")
    .eq("username", username)
    .maybeSingle<Pick<Profile, "id">>();

  if (error) {
    return false;
  }

  return Boolean(data);
}

export async function createProfile(
  supabase: SupabaseClient,
  userId: string,
  username: string,
) {
  return supabase.from("profiles").insert({
    id: userId,
    username,
  });
}

export function isUniqueViolation(errorCode?: string) {
  return errorCode === "23505";
}
