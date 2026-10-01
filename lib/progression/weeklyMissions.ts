// UI copy only: targets and rewards come from the versioned SQL catalog.
export const weeklyMissionCopy = {
  regular_games: { title: "Régulier", description: "Termine {target} parties cette semaine." },
  wins: { title: "En forme", description: "Remporte {target} parties cette semaine." },
  solo_games: { title: "Solo", description: "Termine {target} parties en Solo." },
  multiplayer_games: { title: "Entre amis", description: "Termine {target} parties en Multijoueur." },
  training_series: { title: "À l'entraînement", description: "Termine {target} séries d'entraînement." },
} as const;
export type WeeklyMissionKey = keyof typeof weeklyMissionCopy;
export type WeeklyMission = {key: WeeklyMissionKey; target: number; progress: number; rewardXp: number; completed: boolean; completedAt: string | null};
export type WeeklySnapshot = {catalogVersion: number; weekStart: string; serverNow: string; nextResetAt: string; missions: WeeklyMission[]};

export function resetRemainingLabel(nextResetAt: string, now: number) {
  const minutes = Math.max(0, Math.ceil((Date.parse(nextResetAt)-now)/60000));
  if (!minutes) return "Réinitialisation en cours…";
  const days = Math.floor(minutes/1440), hours = Math.floor(minutes%1440/60);
  return `Réinitialisation dans ${days ? `${days} j ` : ""}${hours ? `${hours} h` : days ? "" : `${minutes} min`}`.trim();
}
