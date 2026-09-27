-- Duo V1 request limits are private to the service role and shared by all app instances.
create table public.training_duo_rate_limits (
  scope text not null check (scope in (
    'create:account', 'create:ip', 'join:account', 'join:ip',
    'mutation:account', 'mutation:ip', 'presence:account', 'presence:ip'
  )),
  key_hash text not null check (key_hash ~ '^[0-9a-f]{64}$'),
  window_started_at timestamptz not null,
  request_count integer not null check (request_count >= 1),
  primary key (scope, key_hash)
);

alter table public.training_duo_rate_limits enable row level security;
revoke all on public.training_duo_rate_limits from public, anon, authenticated;
grant select, insert, update, delete on public.training_duo_rate_limits to service_role;

create function public.training_duo_consume_rate_limit(
  p_scope text,
  p_account_hash text,
  p_ip_hash text,
  p_account_limit integer,
  p_ip_limit integer,
  p_window_seconds integer
) returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_now timestamptz;
  v_window interval;
  v_account_scope text := p_scope || ':account';
  v_ip_scope text := p_scope || ':ip';
  v_account_lock bigint;
  v_ip_lock bigint;
  v_account_started timestamptz;
  v_ip_started timestamptz;
  v_account_count integer;
  v_ip_count integer;
  v_retry integer := 0;
begin
  if p_scope not in ('create', 'join', 'mutation', 'presence')
    or p_account_hash !~ '^[0-9a-f]{64}$' or p_ip_hash !~ '^[0-9a-f]{64}$'
    or p_account_limit not between 1 and 10000 or p_ip_limit not between 1 and 10000
    or p_window_seconds not between 1 and 3600 then
    raise exception 'duo_invalid_request';
  end if;

  v_window := pg_catalog.make_interval(secs => p_window_seconds);
  v_account_lock := pg_catalog.hashtextextended(v_account_scope || ':' || p_account_hash, 0);
  v_ip_lock := pg_catalog.hashtextextended(v_ip_scope || ':' || p_ip_hash, 0);
  perform pg_catalog.pg_advisory_xact_lock(least(v_account_lock, v_ip_lock));
  if v_account_lock <> v_ip_lock then
    perform pg_catalog.pg_advisory_xact_lock(greatest(v_account_lock, v_ip_lock));
  end if;
  v_now := pg_catalog.clock_timestamp();

  select window_started_at, request_count into v_account_started, v_account_count
    from public.training_duo_rate_limits
    where scope = v_account_scope and key_hash = p_account_hash;
  select window_started_at, request_count into v_ip_started, v_ip_count
    from public.training_duo_rate_limits
    where scope = v_ip_scope and key_hash = p_ip_hash;
  if v_account_started is null or v_account_started <= v_now - v_window then
    v_account_started := v_now;
    v_account_count := 0;
  end if;
  if v_ip_started is null or v_ip_started <= v_now - v_window then
    v_ip_started := v_now;
    v_ip_count := 0;
  end if;
  if v_account_count >= p_account_limit then
    v_retry := greatest(v_retry,
      greatest(1, pg_catalog.ceil(extract(epoch from v_account_started + v_window - v_now))::integer));
  end if;
  if v_ip_count >= p_ip_limit then
    v_retry := greatest(v_retry,
      greatest(1, pg_catalog.ceil(extract(epoch from v_ip_started + v_window - v_now))::integer));
  end if;
  if v_retry > 0 then return v_retry; end if;

  insert into public.training_duo_rate_limits (scope, key_hash, window_started_at, request_count)
    values (v_account_scope, p_account_hash, v_account_started, v_account_count + 1)
    on conflict (scope, key_hash) do update set
      window_started_at = excluded.window_started_at,
      request_count = excluded.request_count;
  insert into public.training_duo_rate_limits (scope, key_hash, window_started_at, request_count)
    values (v_ip_scope, p_ip_hash, v_ip_started, v_ip_count + 1)
    on conflict (scope, key_hash) do update set
      window_started_at = excluded.window_started_at,
      request_count = excluded.request_count;
  return 0;
end;
$$;

revoke execute on function public.training_duo_consume_rate_limit(text,text,text,integer,integer,integer)
  from public, anon, authenticated;
grant execute on function public.training_duo_consume_rate_limit(text,text,text,integer,integer,integer)
  to service_role;
