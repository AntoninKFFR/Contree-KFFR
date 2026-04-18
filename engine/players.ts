import type { PlayerId, TeamId } from "./types";

export const DEFAULT_PLAYER_NAMES: Record<PlayerId, string> = {
  0: "Anto",
  1: "Max",
  2: "Boulais",
  3: "Allan",
};

export const BOT_NAME_POOL = [
  "Max",
  "Allan",
  "Boulais",
  "MC",
  "Ben",
  "Sian",
  "Mathilde",
  "Julien",
  "Baptiste",
];

export function createRandomPlayerNames(random = Math.random): Record<PlayerId, string> {
  const availableNames = [...BOT_NAME_POOL];
  const pickedNames = [1, 2, 3].map(() => {
    const index = Math.min(availableNames.length - 1, Math.floor(random() * availableNames.length));
    const [name] = availableNames.splice(index, 1);
    return name;
  });

  return {
    0: "Anto",
    1: pickedNames[0],
    2: pickedNames[1],
    3: pickedNames[2],
  };
}

export function playerName(
  playerId: PlayerId,
  playerNames: Record<PlayerId, string> = DEFAULT_PLAYER_NAMES,
): string {
  return playerNames[playerId];
}

export function teamName(
  teamId: TeamId,
  playerNames: Record<PlayerId, string> = DEFAULT_PLAYER_NAMES,
): string {
  return teamId === 0
    ? `${playerNames[0]} et ${playerNames[2]}`
    : `${playerNames[1]} et ${playerNames[3]}`;
}
