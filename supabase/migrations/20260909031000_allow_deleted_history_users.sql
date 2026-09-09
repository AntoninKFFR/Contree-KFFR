-- Account deletion may anonymize a historical human while preserving their name snapshot.
do $$
declare
  constraint_name text;
begin
  select con.conname into constraint_name
    from pg_constraint as con
   where con.conrelid = 'public.multiplayer_game_players'::regclass
     and con.contype = 'c'
     and pg_get_constraintdef(con.oid) like '%user_id IS NOT NULL%'
   limit 1;
  if constraint_name is not null then
    execute format(
      'alter table public.multiplayer_game_players drop constraint %I',
      constraint_name
    );
  end if;
end $$;

alter table public.multiplayer_game_players
  add constraint multiplayer_game_players_kind_identity_check
  check (
    (kind = 'human' and bot_profile_id is null)
    or (kind = 'bot' and user_id is null and bot_profile_id is not null)
  );
