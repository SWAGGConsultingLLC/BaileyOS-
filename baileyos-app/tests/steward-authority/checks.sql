\set ON_ERROR_STOP on

do $$
declare n int;
begin
  select count(*) into n from information_schema.role_table_grants
   where table_schema = 'public'
     and table_name in ('steward_grants', 'steward_audit', 'verified_suite_subjects')
     and grantee in ('anon', 'authenticated', 'public');
  if n <> 0 then raise exception 'client roles can reach steward tables, grants %', n; end if;

  select count(*) into n from information_schema.role_table_grants
   where table_schema = 'public' and table_name = 'steward_grants'
     and grantee = 'service_role' and privilege_type = 'SELECT';
  if n <> 1 then raise exception 'service role cannot read grants'; end if;

  select count(*) into n from information_schema.role_table_grants
   where table_schema = 'public' and table_name = 'steward_grants'
     and grantee = 'service_role' and privilege_type <> 'SELECT';
  if n <> 0 then raise exception 'service role can write grants'; end if;

  select count(*) into n from pg_policies
   where schemaname = 'public'
     and tablename in ('steward_grants', 'steward_audit', 'verified_suite_subjects');
  if n <> 0 then raise exception 'steward tables have policies'; end if;
end $$;

insert into public.steward_grants (subject_id) values ('11111111-1111-4111-8111-111111111111');
insert into public.steward_audit (subject_id, action) values ('11111111-1111-4111-8111-111111111111', 'grant');

do $$
begin
  insert into public.steward_audit (subject_id, action) values ('22222222-2222-4222-8222-222222222222', 'promote');
  raise exception 'unknown audit action was stored';
exception when check_violation then null;
end $$;

set role authenticated;
do $$
begin
  perform 1 from public.steward_grants;
  raise exception 'authenticated read a steward grant';
exception when insufficient_privilege then null;
end $$;

do $$
begin
  insert into public.steward_grants (subject_id) values ('22222222-2222-4222-8222-222222222222');
  raise exception 'authenticated inserted a steward grant';
exception when insufficient_privilege then null;
end $$;

do $$
begin
  insert into public.verified_suite_subjects (subject_id) values ('22222222-2222-4222-8222-222222222222');
  raise exception 'authenticated recorded a suite subject';
exception when insufficient_privilege then null;
end $$;

do $$
begin
  insert into public.steward_audit (subject_id, action) values ('22222222-2222-4222-8222-222222222222', 'grant');
  raise exception 'authenticated wrote the audit';
exception when insufficient_privilege then null;
end $$;

reset role;
set role anon;
do $$
begin
  perform 1 from public.steward_grants;
  raise exception 'anon read a steward grant';
exception when insufficient_privilege then null;
end $$;

reset role;
set role service_role;
do $$
declare n int;
begin
  select count(*) into n from public.steward_grants where subject_id = '11111111-1111-4111-8111-111111111111' and revoked_at is null;
  if n <> 1 then raise exception 'service role saw % active grants', n; end if;
end $$;

do $$
begin
  insert into public.steward_grants (subject_id) values ('22222222-2222-4222-8222-222222222222');
  raise exception 'service role inserted a grant';
exception when insufficient_privilege then null;
end $$;
