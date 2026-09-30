import "server-only";
import { getSupabaseAdmin } from "./supabaseAdmin";
import { MultiplayerError } from "./multiplayerGame";

export const GAME_XP_SCHEMA_VERSION = "20260930200000";

export class ProgressionReadinessError extends MultiplayerError {
  constructor() {
    super("Le service de fin de partie est temporairement indisponible. Réessaie.", 503, "progression_schema_not_ready");
  }
}

/** No cache: a failed rollout becomes retryable as soon as the migration lands. */
export async function assertProgressionGameXpReady(): Promise<void> {
  try {
    const { data, error } = await getSupabaseAdmin().rpc("progression_game_xp_schema_version");
    if (error || data !== GAME_XP_SCHEMA_VERSION) throw new ProgressionReadinessError();
  } catch {
    console.error("[progression] game XP schema unavailable");
    throw new ProgressionReadinessError();
  }
}

/** Shared by every archive-creating commit; ordinary moves require no check. */
export async function assertProgressionArchiveReady(archive: unknown): Promise<void> {
  if (archive) await assertProgressionGameXpReady();
}
