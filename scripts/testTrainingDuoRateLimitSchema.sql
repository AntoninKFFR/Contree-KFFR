do $$
begin
  if not (select relrowsecurity from pg_catalog.pg_class where oid = 'public.training_duo_rate_limits'::regclass) then
    raise exception 'training_duo_rate_limits must have RLS enabled';
  end if;
  if exists (select 1 from pg_catalog.pg_publication_tables
    where schemaname = 'public' and tablename = 'training_duo_rate_limits') then
    raise exception 'training_duo_rate_limits must not be in Realtime publication';
  end if;
  if pg_catalog.has_table_privilege('anon', 'public.training_duo_rate_limits', 'SELECT')
    or pg_catalog.has_table_privilege('anon', 'public.training_duo_rate_limits', 'INSERT')
    or pg_catalog.has_table_privilege('anon', 'public.training_duo_rate_limits', 'UPDATE')
    or pg_catalog.has_table_privilege('anon', 'public.training_duo_rate_limits', 'DELETE')
    or pg_catalog.has_table_privilege('authenticated', 'public.training_duo_rate_limits', 'SELECT')
    or pg_catalog.has_table_privilege('authenticated', 'public.training_duo_rate_limits', 'INSERT')
    or pg_catalog.has_table_privilege('authenticated', 'public.training_duo_rate_limits', 'UPDATE')
    or pg_catalog.has_table_privilege('authenticated', 'public.training_duo_rate_limits', 'DELETE') then
    raise exception 'client roles must have no rate limit table grants';
  end if;
  if pg_catalog.has_function_privilege('anon',
      'public.training_duo_consume_rate_limit(text,text,text,integer,integer,integer)', 'EXECUTE')
    or pg_catalog.has_function_privilege('authenticated',
      'public.training_duo_consume_rate_limit(text,text,text,integer,integer,integer)', 'EXECUTE')
    or not pg_catalog.has_function_privilege('service_role',
      'public.training_duo_consume_rate_limit(text,text,text,integer,integer,integer)', 'EXECUTE') then
    raise exception 'rate limit RPC grants are not service-only';
  end if;
end $$;
