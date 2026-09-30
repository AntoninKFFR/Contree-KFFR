# Progression V1 foundations (#101)

## Repository audit and choices

- Multiplayer mutations use `lib/server/supabaseAdmin.ts` (`server-only`, bearer token verified by `auth.getUser`) and service-role-only SQL RPCs such as `commit_room_state` / `persist_multiplayer_archive`. Browsers cannot write authoritative room/game state.
- Elo uses private tables, unique source game identities, row locks and a service-role-only `apply_rating_match` transaction. Its read queries expose virtual initial states without creating records.
- Training submissions are replayed and graded in `lib/server/trainingService.ts` before `record_verified_training_series`; records/series have owner SELECT policies and no client writes.
- `profiles` remains private account identity with client username writes. XP is separate from profiles, Elo, scoring and gameplay.
- Progression follows these existing SQL/RPC and `lib/rating/queries.ts` conventions. Owner reads follow training RLS; a virtual 0-XP state follows rating reads. No parallel HTTP service is necessary.
- Important for #102: `public.games` (Solo history) has an owner INSERT policy and is written by the browser. An inserted history row alone is **not** an authoritative proof of completion or victory. #102 must establish a trusted verification path rather than award XP merely from this row. This PR does not change Solo persistence.

## Canonical XP representation

`player_progression.total_xp` is the only level source of truth. No stored level,
reset, season, currency, reward, or UI integration is introduced.

`lib/progression/formulaV1.ts:getProgression` computes every UI field from total XP.
With `k = level - 1`, the cumulative threshold is `25 * k * (k + 7) / 2`;
the next level costs `100 + 25 * k`. A quadratic inverse estimates k, then exact
BigInt comparisons correct adjacent-boundary rounding in constant time.
XP must be an integer in `[0, 9007199254740991]` (JavaScript's exact safe range).
SQL bigint constraints use the same bound. Invalid values fail rather than silently
clamp or round. The maximum is a representation bound, not a product level cap.

`lib/progression/queries.ts:getMyProgression(supabase)` calls `get_my_progression`
without a user ID, validates the result, and delegates all calculations to the helper.
The invoker RPC uses `auth.uid()` and owner RLS. Missing rows return `{total_xp: 0}`
and consequently level 1; reads never insert a row. Auth/query errors propagate
instead of masquerading as zero XP. No UI component currently calls this query.

## Trusted attribution contract

`credit_progression_xp(p_user_id uuid, p_amount bigint, p_source_type text,
p_source_id text)` is callable only by `service_role`. Its definer has an empty
search_path and explicitly qualified table references. It is not a browser award
API and has no HTTP route. #102 should call it through the existing server-only
admin client, after verifying authoritative completion and computing the reward
on the server. Never copy an amount, user ID or arbitrary source from client input.

Sources reserved for future implementations are `solo_game`, `multiplayer_game`,
`permanent_mission`, `weekly_mission`, `training_mission`. None is hooked up here.
`source_id` is a nonempty, trimmed, control-free stable string, at most 200 characters.
Use game IDs for games; repeated weekly missions will need the mission and period
in their stable source ID. Different types form different source namespaces.
The ledger's type/ID/amount explain the gain without a mutable external payload.

The database guarantees one event per `(user_id, source_type, source_id)` with a
UNIQUE constraint. The RPC lazily inserts a zero state and locks the player's row.
Under that lock it inserts the event with `ON CONFLICT DO NOTHING`, then increments
the total only for a new event. All steps are in the same PostgreSQL transaction;
validation/FK/overflow failures roll back state creation and ledger insertion.
Concurrent first calls, identical retries and different sources cannot lose or
double-credit XP. Different users may reuse a source ID independently.

A matching retry returns the original event ID and amount, `credited: false`,
and the current total under the lock. It does not update timestamps. A new award
returns `credited: true`. Reusing a source with a different amount fails with
`progression_source_amount_mismatch` (23514), preserving the original reward.
`total_xp` is the current balance, not a snapshot of the first award response.

Both tables have RLS, owner SELECT policies and explicit SELECT grants only for
authenticated/service_role. No INSERT, UPDATE, DELETE or TRUNCATE grant exists
for anon/authenticated/service_role. Even trusted application code must use the
RPC, preserving ledger/total consistency; database owner administration is the
usual privileged boundary. Account deletion cascades both tables, consistent
with training records; this ledger is retained for the lifetime of the account.

## Validation

- `npm run typecheck`, `npm run lint`, `npm test`.
- `npm run test:db:progression`: use only disposable local Supabase after reset,
  with `PROGRESSION_TEST_SUPABASE_URL`, `PROGRESSION_TEST_SUPABASE_ANON_KEY` and
  `PROGRESSION_TEST_SUPABASE_SERVICE_ROLE_KEY`. Non-local URLs are rejected.
- `supabase db query --local --file scripts/testProgressionSchema.sql`: catalog
  assertions for RLS, definer search_path, RPC privileges and absence of direct
  writes, including TRUNCATE. Real JWT tests cover owner/cross-user reads,
  all client writes, RPC denial, repeated/concurrent attribution, source namespaces,
  changed-amount rejection, missing users, invalid parameters and overflow rollback.
- `.github/workflows/progression-db.yml` resets a disposable local Supabase,
  runs these tests, schema lint and advisors. Existing social/rating/training
  workflows also run for this migration to detect regressions.

No production migration is applied by this PR. Deploy the migration before any
future consumer, and keep the server credential outside browser bundles.
