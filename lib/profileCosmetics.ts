import type { SupabaseClient } from "@supabase/supabase-js";
export const cosmeticSlots = ["title", "badge", "frame"] as const;
export type CosmeticSlot = (typeof cosmeticSlots)[number];
// Stable identities and safe renderer variants only; names/levels are canonical DB data.
export const cosmeticRenderers = {
  title_taker: { slot: "title", variant: "standard" },
  title_steady_hand: { slot: "title", variant: "standard" },
  title_strategist: { slot: "title", variant: "standard" },
  title_fearless: { slot: "title", variant: "standard" },
  title_auction_master: { slot: "title", variant: "standard" },
  title_fine_blade: { slot: "title", variant: "standard" },
  title_contree_ace: { slot: "title", variant: "standard" },
  title_old_hand: { slot: "title", variant: "standard" },
  title_table_master: { slot: "title", variant: "standard" },
  title_kffr_legend: { slot: "title", variant: "standard" },
  badge_club: { slot: "badge", variant: "club" },
  badge_diamond: { slot: "badge", variant: "diamond" },
  badge_spade: { slot: "badge", variant: "spade" },
  badge_heart: { slot: "badge", variant: "heart" },
  badge_crown: { slot: "badge", variant: "crown" },
  badge_coinche: { slot: "badge", variant: "coinche" },
  badge_surcoinche: { slot: "badge", variant: "surcoinche" },
  badge_kffr: { slot: "badge", variant: "kffr" },
  frame_gold_fine: { slot: "frame", variant: "gold_fine" },
  frame_ivory: { slot: "frame", variant: "ivory" },
  frame_black_gold: { slot: "frame", variant: "black_gold" },
  frame_contree: { slot: "frame", variant: "contree" },
  frame_prestige: { slot: "frame", variant: "prestige" },
  frame_kffr_signature: { slot: "frame", variant: "kffr_signature" },
} as const;
export type CosmeticKey = keyof typeof cosmeticRenderers;
export type BadgeVariant =
  | "club"
  | "diamond"
  | "spade"
  | "heart"
  | "crown"
  | "coinche"
  | "surcoinche"
  | "kffr";
export type FrameVariant =
  | "gold_fine"
  | "ivory"
  | "black_gold"
  | "contree"
  | "prestige"
  | "kffr_signature";
export type EquippedCosmetic = Pick<CosmeticItem, "key" | "slot" | "name" | "visualVariant">;
export type CosmeticItem = {
  key: CosmeticKey;
  slot: CosmeticSlot;
  name: string;
  description: string | null;
  visualVariant: string;
  unlockType: "level";
  unlockLevel: number;
  unlocked: boolean;
  unlockedAt: string | null;
  equipped: boolean;
};
export type CosmeticsSnapshot = {
  catalogVersion: number;
  equipped: Record<CosmeticSlot, CosmeticKey | null>;
  items: CosmeticItem[];
};
export const PROFILE_COSMETICS_CHANGED_EVENT = "kffr:profile-cosmetics-changed";
export function notifyProfileCosmeticsChanged() {
  if (typeof window !== "undefined")
    window.dispatchEvent(new Event(PROFILE_COSMETICS_CHANGED_EVENT));
}
export async function getMyProfileCosmetics(
  client: SupabaseClient,
): Promise<CosmeticsSnapshot> {
  const { data, error } = await client.rpc("get_my_unlocked_profile_cosmetics");
  if (error) throw error;
  const invalid = () => {
    throw new Error("Invalid profile collection");
  };
  if (
    !data ||
    data.catalogVersion !== 1 ||
    !Array.isArray(data.items) ||
    data.items.length > 24 ||
    !data.equipped ||
    typeof data.equipped !== "object"
  )
    return invalid();
  const seen = new Set<string>();
  const items: CosmeticItem[] = data.items.map(
    (row: Record<string, unknown>) => {
      if (
        !row ||
        typeof row.key !== "string" ||
        !Object.hasOwn(cosmeticRenderers, row.key) ||
        seen.has(row.key)
      )
        return invalid();
      const key = row.key as CosmeticKey,
        renderer = cosmeticRenderers[key];
      seen.add(key);
      if (
        row.slot !== renderer.slot ||
        row.visualVariant !== renderer.variant ||
        row.unlockType !== "level" ||
        typeof row.name !== "string" ||
        !row.name.trim() ||
        row.name.length > 80 ||
        !(
          row.description === null ||
          (typeof row.description === "string" && row.description.length <= 300)
        ) ||
        !Number.isSafeInteger(row.unlockLevel) ||
        Number(row.unlockLevel) < 1 ||
        row.unlocked !== true ||
        typeof row.equipped !== "boolean" ||
        typeof row.unlockedAt !== "string" ||
        !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(
          row.unlockedAt,
        ) ||
        !Number.isFinite(Date.parse(row.unlockedAt))
      )
        return invalid();
      return {
        key,
        slot: renderer.slot,
        name: row.name,
        description: row.description,
        visualVariant: renderer.variant,
        unlockType: "level",
        unlockLevel: row.unlockLevel,
        unlocked: row.unlocked,
        unlockedAt: row.unlockedAt,
        equipped: row.equipped,
      } as CosmeticItem;
    },
  );
  const equipped = {} as CosmeticsSnapshot["equipped"];
  for (const slot of cosmeticSlots) {
    const key = data.equipped[slot],
      active = items.filter((i) => i.slot === slot && i.equipped);
    if (
      active.length > 1 ||
      (key === null
        ? active.length !== 0
        : typeof key !== "string" ||
          active.length !== 1 ||
          active[0].key !== key)
    )
      return invalid();
    equipped[slot] = key;
  }
  return { catalogVersion: 1, equipped, items };
}
export async function setMyProfileCosmetic(
  client: SupabaseClient,
  slot: CosmeticSlot,
  key: CosmeticKey | null,
) {
  const { error } = await client.rpc("set_my_profile_cosmetic", {
    p_slot: slot,
    p_cosmetic_key: key,
  });
  if (error) throw error;
  notifyProfileCosmeticsChanged();
}
export function equippedCosmetics(
  snapshot: CosmeticsSnapshot | null | undefined,
) {
  return {
    title: snapshot?.items.find((i) => i.slot === "title" && i.equipped),
    badge: snapshot?.items.find((i) => i.slot === "badge" && i.equipped),
    frame: snapshot?.items.find((i) => i.slot === "frame" && i.equipped),
  };
}
