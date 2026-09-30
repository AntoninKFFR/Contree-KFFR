# Progression UI V1 (#103)

`ProgressionProvider` in the root layout owns the shared client snapshot. Navbar,
Home, Profile and `/progression` consume `useProgression()`. The level and all XP
values come exclusively from `getMyProgression()` and the existing `getProgression()`
formula. UI components never credit XP or compute another level curve.

## Refresh and auth

Reads occur after session initialization/account changes, navigation, explicit
retry, returning to a visible window, reconnecting, and `PROGRESSION_CHANGED_EVENT`.
`notifyProgressionChanged()` emits that signal after a successful server Solo
`game-over` response or when `useMultiplayerRoomSync` applies a new terminal Multi
view. `shouldInvalidateProgressionForRoomTransition` compares room ID, game ID,
room status and game phase against the previous committed view. An initial
finished room invalidates once; repeated terminal heartbeats/loads do not. A new
game ID can invalidate again when it finishes. The generic Multi transport only
returns data. Detection runs in an effect, never in a replayable state updater.
Repeated signals
are debounced for 150 ms; concurrent reads coalesce into one subsequent read.
There is no periodic progression polling. Presence heartbeats remain active and
update room views without repeatedly invalidating the same finished game. Delayed
outbox completion is reflected on navigation/focus/online or explicit refresh.
No event handler invokes an XP write RPC.

Account changes clear the snapshot immediately. An epoch discards obsolete
requests; logout clears XP and recent events. Errors preserve the rest of the
application and expose a retry; recent-ledger errors are isolated from the main
summary. A temporary initial auth failure can also be retried.

## Presentation

The shared accessible progressbar uses XP within the level as `aria-valuenow`
and next-level cost as `aria-valuemax`, with the canonical percentage for width.
Desktop retains the 56 px navbar and adds a 3 px track under the truncated account
name and level badge. Wide desktops retain the centered navigation; narrower
desktops use a smaller account block and reserve space for all game controls.
Below 1120 px the details move into the scrollable mobile
menu. Home remains a Server Component with a small client card that returns null
for guests. Profile displays progression before statistics. `/progression` provides
real XP and level data, plus honest future Missions/Rewards placeholders.

Recent XP uses the existing owner-only ledger RLS, with five rows ordered by date
and ID. Only amount, source type and date are selected. Source IDs/UUIDs are never
displayed. No schema change or new RPC is required.

## Validation and rollout

Component/provider/transport tests cover auth races, retries, 0/100 XP, repeated
signals and error isolation. The `progression-ui` Playwright project uses synthetic
browser-only Supabase routes, not DB credentials. Its separate CI job builds with
fixture public configuration; the existing smoke and DB workflows remain intact.
Dark/light screenshots cover Home, Profile, Progression and mobile account menus.
Checks include 1440/1120/768/568/320 px, landscape, a 720 px viewport equivalent
to 200% zoom on 1440 px, keyboard Escape and horizontal overflow.

Deploy after the existing #101/#102 migrations. This UI adds no migration, changes
no XP amounts/gameplay, and implements no mission or cosmetic system. #104/#105
can replace the Missions placeholder while retaining this shared progression source.
