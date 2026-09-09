alter table public.rooms
  drop constraint if exists rooms_scoring_mode_check;

alter table public.rooms
  add constraint rooms_scoring_mode_check
  check (scoring_mode in ('ffb', 'announced-points', 'made-points'));

alter table public.multiplayer_games
  drop constraint if exists multiplayer_games_scoring_mode_check;

alter table public.multiplayer_games
  add constraint multiplayer_games_scoring_mode_check
  check (scoring_mode in ('ffb', 'announced-points', 'made-points'));
