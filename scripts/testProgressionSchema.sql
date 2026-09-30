-- Catalog checks complement the real JWT tests; no writes to application data.
do $$
declare
  v_role text;
  v_table text;
  v_privilege text;
  v_function oid := 'public.credit_progression_xp(uuid,bigint,text,text)'::regprocedure;
begin
  if not exists (select 1 from pg_proc where oid = v_function
    and prosecdef and proconfig @> array['search_path=""']) then
    raise exception 'credit function must be definer with empty search_path';
  end if;
  foreach v_role in array array['anon', 'authenticated'] loop
    if has_function_privilege(v_role, v_function, 'EXECUTE') then
      raise exception 'client can execute credit function: %', v_role;
    end if;
  end loop;
  if not has_function_privilege('service_role', v_function, 'EXECUTE') then
    raise exception 'service_role needs credit EXECUTE';
  end if;
  foreach v_table in array array['player_progression', 'progression_xp_events'] loop
    if not exists (select 1 from pg_class where oid = ('public.' || v_table)::regclass and relrowsecurity) then
      raise exception 'RLS missing on %', v_table;
    end if;
    foreach v_role in array array['anon', 'authenticated', 'service_role'] loop
      foreach v_privilege in array array['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'] loop
        if has_table_privilege(v_role, 'public.' || v_table, v_privilege) then
          raise exception 'unexpected direct write grant: % % %', v_role, v_table, v_privilege;
        end if;
      end loop;
    end loop;
  end loop;
  if not exists (select 1 from pg_constraint
    where conrelid = 'public.progression_xp_events'::regclass
    and conname = 'progression_xp_events_source_unique' and contype = 'u') then
    raise exception 'source uniqueness constraint missing';
  end if;
end;
$$;
