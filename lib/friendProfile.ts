import { cosmeticRenderers, type CosmeticKey, type CosmeticSlot, type EquippedCosmetic } from "@/lib/profileCosmetics";
import { ratingRank } from "@/lib/rating/formulaV1";
export type FriendStats = { games: number; wins: number; losses: number; winrate: number };
export type FriendProfile = {
  userId: string; username: string; level: number;
  equipped: Record<CosmeticSlot, EquippedCosmetic | null>;
  solo: FriendStats; multiplayer: FriendStats;
  rating: { rating: number; rank: string; position: number } | null;
};
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid friend profile");
  return value as Record<string, unknown>;
}
function integer(value: unknown, minimum = 0): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum) throw new Error("Invalid friend integer");
  return value as number;
}
function text(value: unknown, max: number): string {
  if (typeof value !== "string" || !value.trim() || value.length > max) throw new Error("Invalid friend text");
  return value;
}
function stats(value: unknown): FriendStats {
  const r = record(value);
  const games = integer(r.games), wins = integer(r.wins), losses = integer(r.losses), winrate = integer(r.winrate);
  if (games !== wins + losses || winrate > 100 || winrate !== (games ? Math.round(100 * wins / games) : 0)) throw new Error("Inconsistent friend stats");
  return { games, wins, losses, winrate };
}
function cosmetic(value: unknown, slot: CosmeticSlot): EquippedCosmetic | null {
  if (value === null) return null;
  const r = record(value);
  const key = text(r.key, 80);
  if (!Object.hasOwn(cosmeticRenderers, key)) throw new Error("Unknown cosmetic");
  const renderer = cosmeticRenderers[key as CosmeticKey];
  if (r.slot !== slot || renderer.slot !== slot || r.visualVariant !== renderer.variant) throw new Error("Invalid cosmetic slot/variant");
  return { key: key as CosmeticKey, slot, name: text(r.name, 80), visualVariant: renderer.variant };
}
export function parseFriendProfile(value: unknown): FriendProfile {
  const r = record(value), e = record(r.equipped);
  const userId = text(r.userId, 36).toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(userId)) throw new Error("Invalid friend UUID");
  let rating: FriendProfile["rating"] = null;
  if (r.rating !== null) {
    const rr = record(r.rating), score = integer(rr.rating);
    const rank = text(rr.rank, 40);
    if (rank !== ratingRank(score)) throw new Error("Invalid friend rank");
    rating = { rating: score, rank, position: integer(rr.position, 1) };
  }
  // Explicit projection drops all extra fields, including accidental private data.
  return { userId, username: text(r.username, 40), level: integer(r.level, 1),
    equipped: { title: cosmetic(e.title, "title"), badge: cosmetic(e.badge, "badge"), frame: cosmetic(e.frame, "frame") },
    solo: stats(r.solo), multiplayer: stats(r.multiplayer), rating };
}
