"use client";

import Link from "next/link";
import type { RefObject } from "react";
import { AudioPopover } from "./AudioPopover";
import { KffrLogo } from "./KffrLogo";
import { ThemeToggle } from "./ThemeToggle";

type Props = {
  contextLabel: string;
  menuId: string;
  menuOpen: boolean;
  menuLabel: string;
  menuButtonRef: RefObject<HTMLButtonElement | null>;
  onOpenMenu: () => void;
};

export function TopBarChrome({ contextLabel, menuId, menuOpen, menuLabel, menuButtonRef, onOpenMenu }: Props) {
  return <header className="coinche-game-topbar coinche-global-header sticky top-0 z-50 flex h-12 shrink-0 items-center justify-between gap-2 border-b px-3 shadow-lg backdrop-blur-md sm:px-5">
    <div className="flex min-w-0 items-center gap-3">
      <Link aria-label="Accueil — KFFR Contrée" className="shrink-0" href="/"><KffrLogo className="h-7 w-[4.65rem] sm:h-8 sm:w-[5.25rem]" variant="compact" /></Link>
      <span aria-hidden="true" className="h-4 w-px shrink-0 bg-white/15" />
      <span className="truncate text-xs font-semibold text-white/55">{contextLabel}</span>
    </div>
    <div className="flex shrink-0 items-center gap-1 sm:gap-2">
      <AudioPopover />
      <ThemeToggle />
      <button aria-controls={menuId} aria-expanded={menuOpen} aria-label={menuLabel} className="coinche-chrome-icon" onClick={onOpenMenu} ref={menuButtonRef} type="button">☰</button>
    </div>
  </header>;
}
