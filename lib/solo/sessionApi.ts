import { notifyProgressionChanged } from "@/lib/progression/events";
import { getSupabaseClient } from "@/lib/supabaseClient";
import type { SoloSession, SoloTransport } from "./sessionTypes";

async function identity() {
  const client = getSupabaseClient();
  if (!client) return null;
  const { data, error } = await client.auth.getSession();
  if (error) throw error;
  return data.session ? { token: data.session.access_token, userId: data.session.user.id } : null;
}
function storageKey(userId: string) { return `kffr-solo-session:${userId}`; }
async function call(path: string, token: string, body?: unknown): Promise<SoloSession> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(`/api/solo/sessions${path}`, {
        method: body === undefined ? "GET" : "POST", cache: "no-store",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      if (!response.ok) {
        const error = new Error("Impossible de synchroniser la partie Solo.");
        if (response.status < 500) throw Object.assign(error, { terminal: true, status: response.status });
        throw error;
      }
      const { data } = await response.json() as { data: SoloSession };
      if (data.state.phase === "game-over") notifyProgressionChanged();
      return data;
    } catch (error) {
      if (attempt === 2 || (error && typeof error === "object" && "terminal" in error)) throw error;
      await new Promise((resolve) => setTimeout(resolve, 300 * (attempt + 1)));
    }
  }
  throw new Error("Solo synchronization failed");
}

export const soloSessionTransport: SoloTransport = {
  async start(rules, startKey) {
    const who = await identity();
    if (!who) return null; // Anonymous Solo stays entirely local.
    const result = await call("", who.token, { rules, startKey });
    window.localStorage.setItem(storageKey(who.userId), result.id);
    return result;
  },
  async load() {
    const who = await identity();
    if (!who) return null;
    const id = window.localStorage.getItem(storageKey(who.userId));
    if (!id) return null;
    try { return await call(`/${encodeURIComponent(id)}`, who.token); }
    catch (error) {
      if (error && typeof error === "object" && "status" in error && error.status === 404) {
        window.localStorage.removeItem(storageKey(who.userId));
        return null;
      }
      throw error;
    }
  },
  async move(session, intent) {
    const who = await identity();
    if (!who) throw new Error("Reconnecte-toi pour continuer cette partie.");
    return call(`/${encodeURIComponent(session.id)}`, who.token, { expectedVersion: session.version, intent });
  },
};
