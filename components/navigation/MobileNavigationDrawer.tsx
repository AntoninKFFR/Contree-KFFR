"use client";

import Link from "next/link";
import { createPortal } from "react-dom";
import { AccessibleDialog } from "@/components/ui/AccessibleDialog";
import { ProfileIdentity } from "@/components/profile/ProfileCosmetics";
import { ProgressionBar } from "@/components/progression/ProgressionCard";
import type { CosmeticsSnapshot } from "@/lib/profileCosmetics";
import type { ProgressionSummary } from "@/lib/progression/formulaV1";
import { formatProgressionNumber, formatXp } from "@/lib/progression/format";
import { appNavigationItems, type NavigationLink } from "@/lib/ui/appNavigation";

type Props = {
  activeHref: string | null;
  authenticated: boolean;
  cosmetics: CosmeticsSnapshot | null | undefined;
  onClose: () => void;
  onTrainingToggle: () => void;
  summary: ProgressionSummary | null;
  trainingOpen: boolean;
  trainingActive: boolean;
  username: string | null;
};

export function MobileNavigationDrawer({ activeHref, authenticated, cosmetics, onClose, onTrainingToggle, summary, trainingOpen, trainingActive, username }: Props) {
  const link = (item: NavigationLink) => <Link aria-current={activeHref === item.href ? "page" : undefined}
    className={`coinche-topnav-link ${activeHref === item.href ? "coinche-topnav-link--active" : ""}`}
    href={item.href} key={item.href} onClick={onClose} scroll={activeHref !== item.href}>{item.label}</Link>;

  return createPortal(<AccessibleDialog backdropClassName="coinche-navigation-backdrop" closeLabel="Fermer le menu" minimalHeader onClose={onClose} title="Navigation KFFR" width="navigation">
    <nav aria-label="Navigation mobile" className="coinche-mobile-nav" id="mobile-navigation">
      <div className="coinche-mobile-nav-routes">
        {appNavigationItems(authenticated).map((item) => item.id === "play" ? <section aria-label={item.label} className="coinche-mobile-play" key={item.id}>
          <p className="coinche-mobile-nav-label">{item.label}</p>
          <div>{item.children!.map(link)}</div>
        </section> : item.id === "training" ? <section key={item.id}>
          <button aria-controls="mobile-training-navigation" aria-expanded={trainingOpen}
            className={`coinche-topnav-link coinche-mobile-training-toggle ${trainingActive ? "coinche-topnav-link--active" : ""}`}
            onClick={onTrainingToggle} type="button">{item.label}<span aria-hidden="true">{trainingOpen ? "⌃" : "⌄"}</span></button>
          {trainingOpen ? <div className="coinche-mobile-training-links" id="mobile-training-navigation">{item.children!.map(link)}</div> : null}
        </section> : link(item))}
      </div>
      <section aria-label="Compte" className="progression-mobile-account">
        {authenticated ? <>
          <Link aria-current={activeHref === "/profile" ? "page" : undefined} className={`coinche-topnav-link coinche-mobile-identity ${activeHref === "/profile" ? "coinche-topnav-link--active" : ""}`} href="/profile" onClick={onClose} scroll={activeHref !== "/profile"} title={username ?? "Profil"}>
            <ProfileIdentity compact snapshot={cosmetics} name={<span className="coinche-mobile-username">{username ?? "Profil"}</span>} />
            <span className="coinche-mobile-profile-label">Profil <span aria-hidden="true">→</span></span>
          </Link>
          {summary ? <div className="coinche-mobile-progression"><p>Niv. {summary.level} · {formatProgressionNumber(summary.xpIntoLevel)} / {formatXp(summary.xpForNextLevel)}</p><ProgressionBar mini summary={summary} /></div> : null}
          {link({ href: "/progression", label: "Ma progression" })}
        </> : link({ href: "/login", label: "Se connecter" })}
      </section>
    </nav>
  </AccessibleDialog>, document.body);
}
