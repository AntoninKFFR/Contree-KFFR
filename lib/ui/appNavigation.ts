export type NavigationLink = { href: string; label: string; routes?: readonly string[] };
export type NavigationMenu = "play" | "training";
export type NavigationItem = NavigationLink & { private?: boolean } & (
  { id: NavigationMenu; children: readonly NavigationLink[] } |
  { id: "home" | "leaderboard" | "friends" | "history" | "rules"; children?: never }
);

// One catalogue for desktop menus and the mobile drawer. Training destinations
// retain their existing catalogue anchors; routes map exercises to those sections.
export const APP_NAVIGATION: readonly NavigationItem[] = [
  { id: "home", href: "/", label: "Accueil" },
  { id: "play", href: "/solo", label: "Jouer", children: [
    { href: "/solo", label: "Solo" },
    { href: "/multiplayer", label: "Multijoueur" },
  ] },
  { id: "leaderboard", href: "/leaderboard", label: "Classement", private: true },
  { id: "friends", href: "/friends", label: "Amis", private: true },
  { id: "history", href: "/history", label: "Historique", private: true },
  { id: "training", href: "/training", label: "Entraînement", children: [
    { href: "/training", label: "Vue d’ensemble" },
    { href: "/training#calculer", label: "Calculer", routes: ["/training/puzzle/trick-value", "/training/puzzle/pile-count"] },
    { href: "/training#memoriser", label: "Mémoriser", routes: ["/training/puzzle/master-cards", "/training/puzzle/master-in-hand", "/training/puzzle/played-cards", "/training/puzzle/trick-recall"] },
    { href: "/training#deduire", label: "Déduire", routes: ["/training/puzzle/opponent-voids", "/training/game"] },
    { href: "/training#annoncer", label: "Annoncer", routes: ["/training/puzzle/bidding", "/training/puzzle/bid-reading", "/training/conventions", "/training/duo"] },
  ] },
  { id: "rules", href: "/rules", label: "Règles" },
];

export function appNavigationItems(authenticated: boolean) {
  return APP_NAVIGATION.filter((item) => !item.private || authenticated);
}

export function appNavigationLinks(authenticated: boolean) {
  return appNavigationItems(authenticated).filter((item) => item.id !== "play");
}

export function matchesNavigationRoute(pathname: string, href: string): boolean {
  const path = pathname.split(/[?#]/)[0].replace(/\/+$/, "") || "/";
  return path === href || (href !== "/" && path.startsWith(`${href}/`));
}

export function isTrainingRoute(pathname: string) {
  return matchesNavigationRoute(pathname, "/training");
}

/** A single destination is active, including Training exercises and anchor links. */
export function activeNavigationHref(pathname: string, hash = ""): string | null {
  const path = pathname.split(/[?#]/)[0].replace(/\/+$/, "") || "/";
  for (const item of APP_NAVIGATION) {
    if (item.id === "training") {
      if (path === item.href) return item.children!.find((link) => link.href === `${path}${hash}`)?.href ?? item.href;
      const section = item.children!.find((link) => link.routes?.some((route) => matchesNavigationRoute(path, route)));
      if (section) return section.href;
    } else if (item.children) {
      const child = item.children.find((link) => matchesNavigationRoute(path, link.href));
      if (child) return child.href;
    } else if (matchesNavigationRoute(path, item.href)) return item.href;
  }
  if (matchesNavigationRoute(path, "/profile")) return "/profile";
  if (matchesNavigationRoute(path, "/progression")) return "/progression";
  if (matchesNavigationRoute(path, "/login")) return "/login";
  return null;
}
