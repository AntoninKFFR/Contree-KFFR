import { parseSoloResponse, SoloFailure, uuidPattern, type NativeSoloSession, type SoloIntent } from "./contract";
import type { CustomRulesetInput } from "../../../../engine/rulesets/custom";

// Verified repository homepage and deployed Solo endpoint (unauthenticated GET -> 401).
// Keep bearer tokens on this exact HTTPS origin; never accept a game-supplied URL.
export const SOLO_ORIGIN = "https://contree-kffr.vercel.app";
export type SoloIdentity = { user: { id: string }; access_token: string; expires_at?: number };
export type SoloApi = ReturnType<typeof createSoloApi>;
export function createSoloApi(fetcher: typeof fetch = fetch, timeoutMs = 15_000) {
  async function call(who: SoloIdentity, signal: AbortSignal, id?: string, body?: unknown): Promise<NativeSoloSession> {
    if (id !== undefined && !uuidPattern.test(id)) throw new SoloFailure("Identifiant de partie invalide.", 0, "invalid_id");
    if (!who.access_token || (who.expires_at !== undefined && who.expires_at * 1000 <= Date.now())) throw new SoloFailure("Session expirée. Reconnecte-toi.", 401, "expired");
    const request = new AbortController();
    const abort = () => request.abort();
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) request.abort();
    const timer = setTimeout(abort, timeoutMs);
    try {
      // Mutations are NEVER automatically replayed after a timeout or network error.
      const response = await fetcher(SOLO_ORIGIN + "/api/solo/sessions" + (id ? "/" + id : ""), {
        method: body === undefined ? "GET" : "POST", signal: request.signal, redirect: "error", cache: "no-store",
        headers: { Authorization: "Bearer " + who.access_token, "Content-Type": "application/json" },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      if (!response.ok) throw new SoloFailure(response.status === 401 ? "Session expirée. Vérifie ton compte pour reprendre."
        : response.status === 404 ? "Cette partie n’est plus disponible."
        : response.status === 400 ? "Action refusée par le serveur. Vérifie le tour, l’enchère ou la carte choisie."
        : "Le serveur Solo est indisponible. Réessaie plus tard.", response.status, "http");
      const raw = await response.text();
      if (request.signal.aborted || raw.length > 2_000_000) throw new SoloFailure("Réponse Solo interrompue ou trop volumineuse.", 0, "invalid_response");
      let json: unknown;
      try { json = JSON.parse(raw); } catch { throw new SoloFailure("Réponse Solo illisible.", 0, "invalid_response"); }
      const result = parseSoloResponse(json);
      if (id && result.id !== id) throw new SoloFailure("La réponse ne correspond pas à cette partie.", 0, "invalid_response");
      return result;
    } catch (error) {
      if (error instanceof SoloFailure) throw error;
      throw new SoloFailure("Connexion Solo interrompue. Recharge avant de rejouer.", 0, "network");
    } finally { clearTimeout(timer); signal.removeEventListener("abort", abort); }
  }
  return {
    load: (who: SoloIdentity, signal: AbortSignal, id: string) => call(who, signal, id),
    start: (who: SoloIdentity, signal: AbortSignal, startKey: string, rules: CustomRulesetInput = { presetId: "contree-kffr" }) => call(who, signal, undefined, { rules, startKey }),
    move: (who: SoloIdentity, signal: AbortSignal, current: NativeSoloSession, intent: SoloIntent) => call(who, signal, current.id, { expectedVersion: current.version, intent }),
  };
}
