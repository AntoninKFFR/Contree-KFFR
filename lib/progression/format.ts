const frenchInteger = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
export function formatProgressionNumber(value: number) { return frenchInteger.format(value); }
export function formatXp(value: number) { return `${formatProgressionNumber(value)} XP`; }
export function xpSourceLabel(source: string) {
  return source === "solo_game" ? "Partie Solo" : source === "multiplayer_game" ? "Multijoueur" : source === "permanent_mission" ? "Mission" : "Progression";
}
