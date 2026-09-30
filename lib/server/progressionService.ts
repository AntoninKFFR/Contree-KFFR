import "server-only";
import { getSupabaseAdmin } from "./supabaseAdmin";

export async function applyProgressionAfterFinish(gameId: string): Promise<void> {
  try {
    const { data, error } = await getSupabaseAdmin().rpc("apply_progression_multiplayer_game", { p_game_id: gameId });
    if (error) throw error;
    if (data === "applied") console.info("[progression] multiplayer applied", { gameId });
  } catch (error) {
    // The pending outbox survives failure; archive and rating remain committed.
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "transport_error";
    console.error("[progression] multiplayer apply failed", { gameId, code });
  }
}
