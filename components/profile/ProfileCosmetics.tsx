"use client";
import type { ReactNode } from "react";
import {
  cosmeticRenderers,
  equippedCosmetics,
  type BadgeVariant,
  type CosmeticItem,
  type CosmeticsSnapshot,
  type FrameVariant,
} from "@/lib/profileCosmetics";
const shapes: Record<BadgeVariant, ReactNode> = {
  club: (
    <>
      <circle cx="12" cy="7" r="3.5" />
      <circle cx="7.5" cy="12" r="3.5" />
      <circle cx="16.5" cy="12" r="3.5" />
      <path d="M10 14h4l1 6H9z" />
    </>
  ),
  diamond: <path d="m12 3 7 9-7 9-7-9z" />,
  spade: (
    <path d="M12 3C9 7 4 9 4 13c0 4 5 5 7 1l-2 6h6l-2-6c2 4 7 3 7-1 0-4-5-6-8-10z" />
  ),
  heart: (
    <path d="M12 20C8 17 3 13 3 8a5 5 0 0 1 9-3 5 5 0 0 1 9 3c0 5-5 9-9 12z" />
  ),
  crown: (
    <path
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      d="m4 7 4 4 4-6 4 6 4-4-2 11H6z"
    />
  ),
  coinche: (
    <>
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        d="m7 6 6 6-6 6m5-12 6 6-6 6"
      />
    </>
  ),
  surcoinche: (
    <>
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        d="m4 6 6 6-6 6m5-12 6 6-6 6m5-12 6 6-6 6"
      />
    </>
  ),
  kffr: (
    <>
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        d="M4 4h16v16H4zM8 7v10m0-5 7-5m-7 5 7 5"
      />
    </>
  ),
};
export function ProfileBadge({
  variant,
  mini = false,
}: {
  variant: BadgeVariant;
  mini?: boolean;
}) {
  return (
    <svg
      aria-hidden="true"
      className={`profile-badge${mini ? " profile-badge--mini" : ""}`}
      viewBox="0 0 24 24"
      fill="currentColor"
    >
      {shapes[variant]}
    </svg>
  );
}
const frameClasses: Record<FrameVariant, string> = {
  gold_fine: "profile-frame--gold-fine",
  ivory: "profile-frame--ivory",
  black_gold: "profile-frame--black-gold",
  contree: "profile-frame--contree",
  prestige: "profile-frame--prestige",
  kffr_signature: "profile-frame--signature",
};
export function ProfileFrame({
  variant,
  compact = false,
  children,
}: {
  variant?: FrameVariant;
  compact?: boolean;
  children: ReactNode;
}) {
  const Tag = compact ? "span" : "div";
  return (
    <Tag
      className={`${variant ? `profile-frame ${frameClasses[variant]}` : "profile-frame-none"}${compact ? " profile-frame--compact" : ""}`}
    >
      {children}
    </Tag>
  );
}
export function ProfileTitle({ item }: { item?: CosmeticItem }) {
  return item ? <span className="profile-title">{item.name}</span> : null;
}
export function ProfileIdentity({
  snapshot,
  name,
  compact = false,
}: {
  snapshot?: CosmeticsSnapshot | null;
  name: ReactNode;
  compact?: boolean;
}) {
  const { title, badge, frame } = equippedCosmetics(snapshot);
  const Line = compact ? "span" : "div";
  return (
    <ProfileFrame
      variant={
        frame
          ? (cosmeticRenderers[frame.key].variant as FrameVariant)
          : undefined
      }
      compact={compact}
    >
      <Line className="profile-identity-line">
        {badge ? (
          <ProfileBadge
            variant={cosmeticRenderers[badge.key].variant as BadgeVariant}
            mini={compact}
          />
        ) : null}
        {name}
      </Line>
      {!compact ? <ProfileTitle item={title} /> : null}
    </ProfileFrame>
  );
}
