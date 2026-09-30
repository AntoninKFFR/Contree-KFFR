# Game XP V1 (#102)

## Audit and scope

Main includes #101. Its ledger, `credit_progression_xp`, exact-number bound,
RLS and canonical `getMyProgression` are reused without modifying that migration.
Solo previously created a random game ID in the browser, ran `useSoloGameLoop`,
and inserted its claimed final state with `saveCompletedGame`. That history is
not proof. Multiplayer already uses verified JWTs, server engine transitions,
versioned SQL commits and `persist_multiplayer_archive`; Elo is a separate
post-commit worker. Training replays verified series, but is not an XP source here.

The engine supports seeded initial deals, but next-round randomness and bot
execution belong to several transitions. Rather than submit a claimed final
state or introduce a second replay engine, connected Solo now uses the existing
engine and official bots on the server, one transition at a time. Anonymous Solo
keeps the existing local engine, bots, collection gates and pacing. Neither the
rules nor scoring algorithms nor Elo tuning are changed. No XP UI is introduced.

## Canonical rewards

`private.progression_game_xp(mode, won, end_reason, kind)` is the single tuning
primitive used by both finalizers. SQL unit tests exercise it directly:

| Result | XP |
| --- | ---: |
| Solo loss / win | 20 / 30 |
| Multiplayer normal loss / win | 30 / 50 |
| Multiplayer forfeit losing team / winning team | 0 / 50 |
| Bot | 0 |

One ledger event per human per game contains the final reward, not separate
participation and victory events. Training never calls these paths.

## Authoritative connected Solo

`POST /api/solo/sessions` accepts only `{ rules, startKey }`. Existing custom-rule
input is normalized/validated by `buildCustomRuleset`, then `createInitialGame`
runs server-side. The database issues the session UUID. `startKey` is only a
per-user startup retry nonce, not the canonical game identity. Reusing it returns
the existing session, and a different ruleset under that nonce is rejected.

`GET /api/solo/sessions/:sessionId` loads the user's session.
`POST` on the same route accepts only `{ expectedVersion, intent }`:
human seat-0 legal bids/cards, next round, or `advance-bot`. JWTs are verified
with `authenticatedUserId` on every route. Owner IDs never come from the body.
Body size is bounded; unknown keys, fabricated scores/winners/amounts/states,
seed/rule replacements and bot-seat actions are rejected.

`solo_game_sessions` holds the authoritative engine state, version, owner,
engine protocol version and timestamps. No browser role can access it directly,
and even service_role has only SELECT plus explicit RPC EXECUTE. The Next server
loads owner-scoped state, checks the phase and turn, and applies an action through
the unchanged engine. Only the server chooses bot actions and deals subsequent
rounds. The HTTP boundary projects every start/read/move response with
`toPlayerGameView(serverState, 0)`. `SoloSession.state` is a `PlayerGameView`:
only `hand` for seat 0 and `handCounts` for all seats, never `hands` or private
opponent cards. SQL and engine retain the complete state. The connected hook and
GameTable consume this view directly, without fabricated hands or placeholders.
Human legality uses the existing `getLegalCards` with the human hand, public trick,
contract mode and rules. Final-card autoplay uses public hand counts. Bot Review,
local bot traces and full bundles are available only for local/anonymous games;
connected sessions never run those analyses or expose hidden hands. The browser cannot submit an end result at all.

`commit_solo_game_session` serializes on the session row and checks its expected
version. A stale request returns the current state without another transition.
Only server-computed state reaches this service-role-only RPC. Rules/player names
remain fixed for the session. On a terminal engine transition, one transaction
inserts `games` with `id = session.id`, calls `credit_progression_xp` with
`source_type = solo_game` / `source_id = session.id`, and advances the session to
completed. Any failure rolls back **all three**; the previous position remains
retryable. Completed sessions return the same state on retries, without reinserting
history or touching XP. Concurrent requests cannot fork the stored trajectory.

`SoloPageClient` no longer calls `saveCompletedGame`; the unsafe writer is removed
from `lib/games.ts` while the existing pure payload builder remains for its callers
and tests. A migration removes client write policies/privileges on `games` without
changing any old rows. An explicit `games_owner_read` SELECT policy preserves
owner history access even if a legacy ALL policy supplied both reads and writes.
The new server path ships in the same PR.

The browser adapter retries transport/server failures three times using the same
startup nonce or expected version. It stores the server session ID per user for
reload recovery, including after completion. A failed action does not advance the
local board. Continued failure pauses input/bots and provides a synchronization
retry; this is not a reward claim. A connected startup failure does not silently
fall back to a reward-eligible local game. Signing out preserves anonymous local
play; a local game started without auth is never converted into a trusted result.

Tradeoff: connected Solo now needs network round trips and server bot computation.
No replay transcript or client seed is needed because every transition is already
authoritative. Session rows are retained until account deletion, with history and
ledger; engine protocol version 1 is recorded. Future incompatible engine changes
must explicitly handle existing sessions instead of accepting browser replacements.

## Multiplayer finalization and recovery

The source is `multiplayer_games` plus its four archived participant rows. Its ID
is the existing `active_game_id`, including rematches. Bots have no beneficiary;
human seats temporarily under bot takeover remain the same archived human owner.

An AFTER INSERT trigger on `multiplayer_games` enqueues
`progression_multiplayer_jobs` in the existing archive transaction. This covers
the shared archive path reached by human actions, normal bot turns, deadlines,
takeover commits and forfeits. XP processing is outside that transaction, so its
failure cannot roll back the completed game, archive or Elo. Enqueue itself is a
simple durable row insertion; no credit is performed in the archive trigger.

`apply_progression_multiplayer_game(gameId)` locks that job, loads the canonical
archive, requires four seats and rejects repeated human identities. It derives
teams, winners and end reason from the archive, credits humans in a stable UUID
lock order and marks the job applied in one transaction. Forfeit losers receive
no event, including no participation reward. Credits reuse #101 and are atomic
across all recipients. A pending/incomplete/unarchived or unknown game is rejected.

`applyRatingAfterFinish` invokes the independent XP helper after its existing Elo
attempt on all three SQL commit branches (ordinary/bot/forfeit, takeover, timeout).
Both SQL and transport XP failures are caught without exposing private details.
A finished room read retries XP after membership checks. If nobody returns to
the room or a rematch has replaced it, the pending job still exists independently.

Operator recovery: `npm run progression:retry -- --allow-host=<exact hostname>`
is dry-run by default; add `--execute` and optional `--limit=1..100` to process
pending jobs using server-side `PROGRESSION_RETRY_SUPABASE_URL` and
`PROGRESSION_RETRY_SERVICE_ROLE_KEY`, mirroring the rating retry script. Never
put credentials in the browser or logs. Retries return `already_applied` once
complete; database uniqueness prevents double credits under concurrency.

## No retroactivity and permissions

No migration scans old games. Multiplayer eligibility requires a job inserted
by the new archive INSERT trigger; existing archives have no job and cannot be
credited even by the retry function. An UPDATE/reinsert conflict on an old archive
does not create one. Solo eligibility requires the new server-created session;
old client history rows are untouched and cannot generate credits.

New session/job tables have RLS with no client grants; all mutating RPCs and the
enqueue trigger have empty search_path, qualified tables and explicit service-role
permissions. #101 grants and owner-read policies are unchanged. Account deletion
cascades sessions and player XP; multiplayer history preserves its existing
anonymization behavior. Database owners and server credentials remain the trusted
administrative boundary.

## Validation

Vitest tests cover authority, strict inputs/JWT routes, guest behavior, reload,
double-click suppression, recovery and unchanged existing Solo/Multi behavior.
SQL unit/catalog tests cover all reward amounts, definer privileges, no client
history insert, legacy archive rejection and injected transient XP failures proving
Solo atomic rollback and durable Multi recovery.

`test:db:progression-games` runs only against local Next + disposable local Supabase.
It plays genuine server Solo games until both wins/losses are covered, submits
every move concurrently, verifies one history/ledger row, stable finished retries,
cross-user rejection and forged-result rejection. It checks a real browser's
connected start/reload and anonymous local play, all Multi winner/forfeit matrices,
bots, concurrency, source identity, total/ledger consistency and RPC denial with
real JWTs. Existing progression, Elo, training, social and E2E workflows also run.

## Fail-safe rollout

Normal order: apply `20260930200000_progression_game_xp.sql`, verify the
service-role-only `progression_game_xp_schema_version()` returns `20260930200000`,
then deploy the application. No production database is modified by this task.
The read-only invoker sentinel has an empty search_path and explicit EXECUTE
permissions; anon/authenticated cannot call it. It is installed in the same
transaction as the full schema and archive outbox trigger.

`assertProgressionGameXpReady()` requires that exact version and fails with
503 / `progression_schema_not_ready` on missing RPC, wrong version or network
failure. There is no readiness cache, so retries recover immediately after the
migration is visible to PostgREST. Connected Solo checks before creating any
session; no unverified fallback occurs. Anonymous/local Solo remains available.

All three archive-creating Multi commit primitives call the shared
`assertProgressionArchiveReady(archive)` before invoking the SQL transaction.
Nonterminal moves do not call the sentinel. If application code arrives before
the migration, terminal actions (including bots, deadlines, takeover and
forfeits) fail temporarily without committing state, archive, Elo or XP. The
previous state/version remains retryable. After migration, replaying the
transition atomically saves the archive and its trigger-created outbox job,
then applies XP normally. This protects the rollout order; it does not promise
compatibility with an administrator subsequently removing installed schema.

Tests cover actual JSON responses from all Solo routes, public-view full games,
local compatibility, missing-function/wrong-version/network readiness failures,
503 with no session creation, terminal commit refusal and recovery, guards on
all archive primitives, real JWT sentinel privileges and unchanged XP/history.

#103 can use `getMyProgression` unchanged; no UI reward/toast/level implementation
is included here.
