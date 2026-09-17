-- Migration rétroactive : création de la table `games` (parties solo).
--
-- Contexte. La table `public.games` préexistait dans le projet Supabase mais
-- n'avait aucune migration de création : les migrations ne faisaient que la
-- modifier (`alter table`). Un environnement vierge ne pouvait donc pas être
-- reconstruit depuis le dépôt (voir docs/PRD-socle.md §8, dette #3).
--
-- Sécurité d'application. Le bloc est gardé par un test d'existence : sur la base
-- partagée où `games` existe déjà, RIEN ne s'exécute (no-op). Sur une base vierge,
-- la table complète, la RLS et les policies sont créées. La colonne complète est
-- déclarée ici ; les migrations `alter table ... add column if not exists`
-- postérieures deviennent alors des no-op.
--
-- Ordre. Ce fichier est volontairement horodaté avant toutes les autres migrations
-- (la table solo précède le travail multijoueur). Sur une base déjà en production,
-- appliquer avec :  supabase db push --include-all

do $$
begin
  if not exists (
    select 1
    from information_schema.tables
    where table_schema = 'public' and table_name = 'games'
  ) then

    create table public.games (
      id             uuid primary key default gen_random_uuid(),
      user_id        uuid not null references auth.users (id) on delete cascade,
      created_at     timestamptz not null default now(),
      won            boolean not null,
      scoring_mode   text not null,
      player_score   integer not null,
      bot_score      integer not null,
      target_score   integer not null,
      bot_summary    text,
      ruleset_id     text,
      ruleset_version integer,
      ruleset_snapshot jsonb,
      round_history  jsonb not null default '[]'::jsonb,
      player_names   jsonb
    );

    create index games_user_id_created_at_idx
      on public.games (user_id, created_at desc);

    alter table public.games enable row level security;

    create policy "Users can read their own games"
      on public.games
      for select
      using (auth.uid() = user_id);

    create policy "Users can insert their own games"
      on public.games
      for insert
      with check (auth.uid() = user_id);

  end if;
end $$;

notify pgrst, 'reload schema';
