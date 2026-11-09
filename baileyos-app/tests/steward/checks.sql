\set ON_ERROR_STOP on

do $$
declare cols text;
declare n int;
begin
  select string_agg(column_name, ',' order by column_name) into cols
    from information_schema.columns
   where table_schema = 'public' and table_name = 'steward_grants';
  if cols <> 'granted_at,revoked_at,user_id' then
    raise exception 'unexpected steward_grants columns: %', cols;
  end if;

  select count(*) into n from pg_policies where schemaname = 'public' and tablename = 'steward_grants';
  if n <> 0 then raise exception 'steward_grants has % policies', n; end if;

  select count(*) into n from information_schema.role_table_grants
   where table_schema = 'public' and table_name = 'steward_grants' and grantee in ('anon', 'authenticated', 'public');
  if n <> 0 then raise exception 'client roles have % grants on steward_grants', n; end if;

  select count(*) into n from information_schema.role_table_grants
   where table_schema = 'public' and table_name = 'steward_grants'
     and grantee = 'service_role' and privilege_type = 'SELECT';
  if n <> 1 then raise exception 'service_role select grant missing, saw %', n; end if;

  select count(*) into n from information_schema.role_table_grants
   where table_schema = 'public' and table_name = 'steward_grants'
     and grantee = 'service_role' and privilege_type <> 'SELECT';
  if n <> 0 then raise exception 'service_role can do more than select'; end if;
end $$;

insert into auth.users (id) values
  ('11111111-1111-4111-8111-111111111111'),
  ('22222222-2222-4222-8222-222222222222');

insert into public.steward_grants (user_id)
values ('11111111-1111-4111-8111-111111111111');

do $$
begin
  insert into public.steward_grants (user_id, granted_at, revoked_at)
  values ('22222222-2222-4222-8222-222222222222', now(), now() - interval '1 day');
  raise exception 'revocation before grant was stored';
exception when check_violation then null;
end $$;

set role service_role;
do $$
declare n int;
begin
  select count(*) into n from public.steward_grants where revoked_at is null;
  if n <> 1 then raise exception 'service role saw % active grants', n; end if;
end $$;

do $$
begin
  insert into public.steward_grants (user_id) values ('22222222-2222-4222-8222-222222222222');
  raise exception 'service role inserted a grant';
exception when insufficient_privilege then null;
end $$;

reset role;
set role authenticated;
do $$
begin
  insert into public.steward_grants (user_id) values ('22222222-2222-4222-8222-222222222222');
  raise exception 'authenticated inserted a grant';
exception when insufficient_privilege then null;
end $$;

do $$
begin
  update public.steward_grants set revoked_at = null;
  raise exception 'authenticated changed a grant';
exception when insufficient_privilege then null;
end $$;

do $$
begin
  perform 1 from public.steward_grants;
  raise exception 'authenticated read the allow list';
exception when insufficient_privilege then null;
end $$;

reset role;
set role anon;
do $$
begin
  insert into public.steward_grants (user_id) values ('22222222-2222-4222-8222-222222222222');
  raise exception 'anon inserted a grant';
exception when insufficient_privilege then null;
end $$;

do $$
begin
  perform 1 from public.steward_grants;
  raise exception 'anon read the allow list';
exception when insufficient_privilege then null;
end $$;

reset role;
update public.steward_grants
   set revoked_at = granted_at
 where user_id = '11111111-1111-4111-8111-111111111111';

set role service_role;
do $$
declare n int;
begin
  select count(*) into n from public.steward_grants where revoked_at is null;
  if n <> 0 then raise exception 'revoked grant still looked active, saw %', n; end if;
end $$;

reset role;
set role authenticated;
do $$
begin
  update public.steward_grants set revoked_at = null
   where user_id = '11111111-1111-4111-8111-111111111111';
  raise exception 'authenticated cleared a revocation';
exception when insufficient_privilege then null;
end $$;
