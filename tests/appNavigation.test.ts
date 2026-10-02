import { describe, expect, it } from "vitest";
import { activeNavigationHref, appNavigationItems, isTrainingRoute, matchesNavigationRoute } from "@/lib/ui/appNavigation";

describe("shared navigation destinations", () => {
  it("preserves the ordered authenticated hierarchy and public destinations", () => {
    expect(appNavigationItems(true).map((item) => item.label)).toEqual(["Accueil", "Jouer", "Classement", "Amis", "Historique", "Entraînement", "Règles"]);
    expect(appNavigationItems(false).map((item) => item.label)).toEqual(["Accueil", "Jouer", "Entraînement", "Règles"]);
  });
  it.each([
    ["/", "/"], ["/friends", "/friends"], ["/friends/player-id", "/friends"],
    ["/multiplayer/room-id", "/multiplayer"], ["/solo", "/solo"], ["/solo/session", "/solo"],
    ["/training", "/training"], ["/training/", "/training"],
    ["/training/puzzle/trick-value?level=2", "/training#calculer"], ["/training/puzzle/pile-count", "/training#calculer"],
    ["/training/puzzle/master-cards", "/training#memoriser"], ["/training/puzzle/master-in-hand", "/training#memoriser"],
    ["/training/puzzle/played-cards", "/training#memoriser"], ["/training/puzzle/trick-recall", "/training#memoriser"],
    ["/training/puzzle/opponent-voids", "/training#deduire"], ["/training/game", "/training#deduire"],
    ["/training/puzzle/bidding", "/training#annoncer"], ["/training/puzzle/bid-reading", "/training#annoncer"],
    ["/training/conventions/bidding", "/training#annoncer"], ["/training/duo/session-id", "/training#annoncer"],
    ["/history/match-id", "/history"], ["/history?filter=solo", "/history"], ["/profile", "/profile"],
    ["/progression", "/progression"], ["/rules", "/rules"], ["/login", "/login"],
    ["/unknown", null], ["/friendship", null], ["/multiplayerish", null], ["/training/puzzle/unknown", null],
  ])("%s activates only %s", (path, expected) => {
    expect(activeNavigationHref(path)).toBe(expected);
  });
  it.each(["calculer", "memoriser", "deduire", "annoncer"])("matches the existing #%s catalogue anchor", (hash) => {
    expect(activeNavigationHref("/training", `#${hash}`)).toBe(`/training#${hash}`);
  });
  it("does not leak a Training anchor into another route and ignores unknown anchors", () => {
    expect(activeNavigationHref("/friends", "#calculer")).toBe("/friends");
    expect(activeNavigationHref("/training", "#unknown")).toBe("/training");
  });
  it("matches segments rather than similar prefixes; home is exact", () => {
    expect(matchesNavigationRoute("/friends/a", "/friends")).toBe(true);
    expect(matchesNavigationRoute("/friends-other", "/friends")).toBe(false);
    expect(matchesNavigationRoute("/solo", "/")).toBe(false);
    expect(isTrainingRoute("/training/duo/a")).toBe(true);
    expect(isTrainingRoute("/training-other")).toBe(false);
  });
});
