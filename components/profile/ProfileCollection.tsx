"use client";
import { useEffect, useRef, useState } from "react";
import { useProgression } from "@/components/progression/ProgressionProvider";
import {
  AppSurface,
  appSecondaryActionClass,
  appSegmentedItemClass,
} from "@/components/ui/AppShell";
import { ProfileBadge, ProfileFrame, ProfileTitle } from "./ProfileCosmetics";
import { getSupabaseClient } from "@/lib/supabaseClient";
import {
  cosmeticSlots,
  cosmeticRenderers,
  setMyProfileCosmetic,
  type CosmeticSlot,
  type CosmeticItem,
  type CosmeticsSnapshot,
  type BadgeVariant,
  type FrameVariant,
} from "@/lib/profileCosmetics";
const labels = { title: "Titres", badge: "Badges", frame: "Cadres" };
export function CosmeticPreview({ item }: { item: CosmeticItem }) {
  const variant = cosmeticRenderers[item.key].variant;
  return (
    <div className="collection-preview">
      {item.slot === "title" ? (
        <ProfileTitle item={item} />
      ) : item.slot === "badge" ? (
        <ProfileBadge variant={variant as BadgeVariant} />
      ) : (
        <ProfileFrame variant={variant as FrameVariant}>
          <span className="font-bold">Votre pseudo</span>
        </ProfileFrame>
      )}
    </div>
  );
}
function CollectionPanel({ snapshot }: { snapshot: CosmeticsSnapshot }) {
  const [slot, setSlot] = useState<CosmeticSlot>("title");
  const [pending, setPending] = useState<string | null>(null),
    [error, setError] = useState<string | null>(null);
  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);
  async function equip(item: CosmeticItem) {
    const client = getSupabaseClient();
    if (!client || pending) return;
    setPending(item.key);
    setError(null);
    try {
      await setMyProfileCosmetic(
        client,
        item.slot,
        item.equipped ? null : item.key,
      );
    } catch {
      if (live.current)
        setError("Impossible de modifier ton équipement. Réessaie.");
    } finally {
      if (live.current) setPending(null);
    }
  }
  return (
    <>
      <div
        role="tablist"
        aria-label="Catégories de collection"
        className="mt-4 grid grid-cols-3 gap-2"
      >
        {cosmeticSlots.map((category, index) => (
          <button
            key={category}
            id={`collection-${category}-tab`}
            role="tab"
            type="button"
            tabIndex={slot === category ? 0 : -1}
            aria-selected={slot === category}
            aria-controls="collection-panel"
            className={appSegmentedItemClass}
            onClick={() => setSlot(category)}
            onKeyDown={(event) => {
              const step =
                event.key === "ArrowRight"
                  ? 1
                  : event.key === "ArrowLeft"
                    ? -1
                    : 0;
              if (!step && event.key !== "Home" && event.key !== "End") return;
              event.preventDefault();
              const next =
                event.key === "Home"
                  ? 0
                  : event.key === "End"
                    ? 2
                    : (index + step + 3) % 3;
              setSlot(cosmeticSlots[next]);
              document
                .getElementById(`collection-${cosmeticSlots[next]}-tab`)
                ?.focus();
            }}
          >
            {labels[category]}
          </button>
        ))}
      </div>
      {error ? (
        <p role="alert" className="mt-3 text-sm text-[var(--text-secondary)]">
          {error}
        </p>
      ) : null}
      <div
        role="tabpanel"
        id="collection-panel"
        aria-labelledby={`collection-${slot}-tab`}
        className="mt-4"
      >
        <ul
          aria-label={labels[slot]}
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
        >
          {snapshot.items
            .filter((item) => item.slot === slot)
            .map((item) => (
              <li key={item.key} className="collection-item">
                <CosmeticPreview item={item} />
                <h3 className="mt-3 break-words font-bold">{item.name}</h3>
                <p className="mt-1 text-xs text-[var(--text-secondary)]">
                  Niveau {item.unlockLevel} requis
                </p>
                <p className="mt-2 text-sm font-semibold">
                  {item.equipped
                    ? "✓ Équipé"
                    : item.unlocked
                      ? "Débloqué"
                      : "Verrouillé"}
                </p>
                {item.unlocked ? (
                  <button
                    type="button"
                    className={`${appSecondaryActionClass} mt-3 w-full`}
                    disabled={pending !== null}
                    aria-label={`${item.equipped ? "Retirer" : "Équiper"} ${item.name}`}
                    onClick={() => void equip(item)}
                  >
                    {pending === item.key
                      ? "Enregistrement…"
                      : item.equipped
                        ? "Retirer"
                        : "Équiper"}
                  </button>
                ) : null}
              </li>
            ))}
        </ul>
      </div>
    </>
  );
}
export function ProfileCollection() {
  const { status, userId, cosmeticsSnapshot, cosmeticsError } =
    useProgression();
  return (
    <AppSurface>
      <h2 className="font-black text-[var(--text-primary)]">Collection</h2>
      <p className="mt-2 text-sm text-[var(--text-secondary)]">
        Personnalise ton profil avec les titres, badges et cadres débloqués au
        fil des niveaux.
      </p>
      {status !== "ready" ? (
        <p className="mt-3 text-sm">Chargement de la collection…</p>
      ) : cosmeticsError || !cosmeticsSnapshot ? (
        <p className="mt-3 text-sm">
          La collection est momentanément indisponible.
        </p>
      ) : (
        <CollectionPanel key={userId} snapshot={cosmeticsSnapshot} />
      )}
    </AppSurface>
  );
}
