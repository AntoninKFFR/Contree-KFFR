// Product copy only. Reward amounts and completion states come from the DB.
export const permanentMissionCopy = {
  first_game: { title: "Première partie", description: "Termine une partie en Solo ou en Multijoueur." },
  first_win: { title: "Première victoire", description: "Remporte ta première partie." },
  first_solo: { title: "Premier Solo", description: "Termine une partie en Solo." },
  first_multiplayer: { title: "Entre amis", description: "Termine une partie en Multijoueur." },
  first_training: { title: "S'entraîner", description: "Termine une série d'entraînement." },
} as const;
export type PermanentMissionKey = keyof typeof permanentMissionCopy;
export const permanentMissionKeys = Object.keys(permanentMissionCopy) as PermanentMissionKey[];
export type PermanentMission = { key: PermanentMissionKey; rewardXp: number; completed: boolean; completedAt: string | null };
