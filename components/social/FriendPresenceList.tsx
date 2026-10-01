import type { ReactNode } from "react";
import { sortFriendsByPresence, type PresenceFriend } from "@/lib/friendPresence";

export function FriendPresenceList<T extends PresenceFriend>({ friends, onlineIds, action }: {
  friends: readonly T[];
  onlineIds: ReadonlySet<string>;
  action: (friend: T) => ReactNode;
}) {
  const sorted = sortFriendsByPresence(friends, onlineIds);
  const online = sorted.filter((friend) => onlineIds.has(friend.userId));
  const offline = sorted.filter((friend) => !onlineIds.has(friend.userId));
  return <div className="friend-presence-list">
    {online.length > 0 ? <PresenceGroup title="En ligne" friends={online} online action={action} /> : null}
    {offline.length > 0 ? <PresenceGroup title="Hors ligne" friends={offline} online={false} action={action} /> : null}
  </div>;
}

function PresenceGroup<T extends PresenceFriend>({ title, friends, online, action }: {
  title: string;
  friends: readonly T[];
  online: boolean;
  action: (friend: T) => ReactNode;
}) {
  return <div className="friend-presence-group">
    <h3 className="friend-presence-heading">{title} · {friends.length}</h3>
    <ul className="friend-presence-rows">
      {friends.map((friend) => <li className="friend-presence-row" key={friend.userId}>
        <span aria-hidden="true" className={`friend-presence-dot ${online ? "friend-presence-dot--online" : ""}`} />
        <span className="friend-presence-identity">
          <span className="friend-presence-name">{friend.username}</span>
          {"level" in friend ? <span className="friend-presence-status">Niv. {String(friend.level)}</span> : null}
          <span className={`friend-presence-status ${online ? "friend-presence-status--online" : ""}`}>{online ? "En ligne" : "Hors ligne"}</span>
        </span>
        <span className="friend-presence-action">{action(friend)}</span>
      </li>)}
    </ul>
  </div>;
}
