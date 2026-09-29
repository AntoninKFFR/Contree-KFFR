export type PresenceFriend = { userId: string; username: string };

const collator = new Intl.Collator("fr", { sensitivity: "base" });

export function sortFriendsByPresence<T extends PresenceFriend>(friends: readonly T[], onlineIds: ReadonlySet<string>): T[] {
  return [...friends].sort((a, b) =>
    Number(onlineIds.has(b.userId)) - Number(onlineIds.has(a.userId))
    || collator.compare(a.username, b.username)
    || a.userId.localeCompare(b.userId));
}

export function filterFriendsBySearch<T extends PresenceFriend>(friends: readonly T[], query: string): T[] {
  const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("fr");
  const needle = normalize(query.trim());
  return needle ? friends.filter((friend) => normalize(friend.username).includes(needle)) : [...friends];
}
