-- Additive insert policy for Living Archive self-attestation logs.
-- Does not drop, replace, or rewrite any existing policy, including bailey-oasis.
-- Does not create or alter age_assertions. If the table or the columns Oasis
-- already writes are missing, this block raises and changes nothing.
-- Identity columns that exist are forced null. A row with a birth date, age,
-- user, or asserter cannot use this policy.

do $migration$
declare
  cols text[];
  ident text[] := array['user_id', 'user', 'asserter', 'asserter_id', 'birthdate', 'birth_date', 'age'];
  required text[] := array['event', 'verified', 'token_hash', 'issuer_id', 'content_category', 'source_id', 'retain_until'];
  check_sql text;
  col text;
  found_ident boolean := false;
begin
  if to_regclass('public.age_assertions') is null then
    raise exception 'public.age_assertions is not in this database; refusing to invent it';
  end if;

  if exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'age_assertions'
      and policyname = 'age_assertions_insert_archive'
  ) then
    raise exception 'age_assertions_insert_archive already exists; refusing to replace it';
  end if;

  select coalesce(array_agg(column_name), '{}') into cols
  from information_schema.columns
  where table_schema = 'public' and table_name = 'age_assertions';

  foreach col in array required loop
    if not col = any (cols) then
      raise exception 'age_assertions is missing column %; refusing to add a policy', col;
    end if;
  end loop;

  check_sql := 'issuer_id = ''bailey-archive'''
    || ' and content_category = ''general'''
    || ' and event in (''shown'', ''yes'', ''no'', ''recheck'')'
    || ' and verified = (event = ''yes'')'
    || ' and token_hash ~ ''^[0-9a-f]{32}$'''
    || ' and char_length(source_id) between 1 and 128'
    || ' and retain_until > now()'
    || ' and retain_until <= now() + interval ''91 days''';

  foreach col in array ident loop
    if col = any (cols) then
      found_ident := true;
      check_sql := check_sql || format(' and %I is null', col);
    end if;
  end loop;

  if not found_ident then
    raise exception 'no known identity column to force null; refusing to add a looser insert policy';
  end if;

  execute format(
    'create policy age_assertions_insert_archive on public.age_assertions for insert to anon, authenticated with check (%s)',
    check_sql
  );
end
$migration$;
