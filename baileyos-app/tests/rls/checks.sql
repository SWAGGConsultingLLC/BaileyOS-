\set ON_ERROR_STOP on

do $$
declare cols text;
declare n int;
begin
  select string_agg(column_name, ',' order by column_name) into cols
    from information_schema.columns
   where table_schema = 'public' and table_name = 'profiles';
  if cols <> 'bio,created_at,display_name,updated_at,user_id' then
    raise exception 'unexpected profiles columns: %', cols;
  end if;
  select count(*) into n from information_schema.role_table_grants
   where table_schema = 'public' and table_name = 'profiles' and grantee = 'anon';
  if n <> 0 then raise exception 'anon has % grants on profiles', n; end if;
  select count(*) into n from information_schema.role_table_grants
   where table_schema = 'public' and table_name = 'profiles'
     and grantee = 'authenticated' and privilege_type = 'DELETE';
  if n <> 0 then raise exception 'authenticated can delete profiles'; end if;
  select count(*) into n from information_schema.role_table_grants
   where table_schema = 'public' and table_name in ('placements', 'desk_accounts', 'placed_count')
     and grantee = 'authenticated' and privilege_type in ('INSERT', 'UPDATE', 'DELETE');
  if n <> 0 then raise exception 'profile migration granted member writes on older tables'; end if;
end $$;

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'a@example.test'),
  ('22222222-2222-2222-2222-222222222222', 'b@example.test');

-- Constraint checks run as the table owner. Superuser bypasses RLS, not checks.
do $$
begin
  insert into public.profiles (user_id, display_name) values ('11111111-1111-1111-1111-111111111111', '  ');
  raise exception 'blank display name was stored';
exception when check_violation then null;
end $$;

do $$
begin
  insert into public.profiles (user_id, display_name) values ('11111111-1111-1111-1111-111111111111', repeat('A', 81));
  raise exception 'long display name was stored';
exception when check_violation then null;
end $$;

do $$
begin
  insert into public.profiles (user_id, display_name, bio) values ('11111111-1111-1111-1111-111111111111', 'Ada', '');
  raise exception 'blank bio was stored';
exception when check_violation then null;
end $$;

set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);

insert into public.profiles (user_id, display_name, bio)
values ('11111111-1111-1111-1111-111111111111', 'Ada', 'A short note');

do $$
declare n int;
begin
  select count(*) into n from public.profiles;
  if n <> 1 then raise exception 'owner should see 1 profile, saw %', n; end if;
  update public.profiles set bio = 'Updated note' where user_id = auth.uid();
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'owner could not update own profile, rows %', n; end if;
end $$;

do $$
begin
  insert into public.profiles (user_id, display_name)
  values ('22222222-2222-2222-2222-222222222222', 'Stolen');
  raise exception 'identity tamper insert was allowed';
exception when insufficient_privilege then null;
end $$;

do $$
begin
  update public.profiles
     set user_id = '22222222-2222-2222-2222-222222222222'
   where user_id = '11111111-1111-1111-1111-111111111111';
  raise exception 'user_id change was allowed';
exception when insufficient_privilege then null;
end $$;

do $$
begin
  insert into public.user_roles (user_id, role)
  values ('11111111-1111-1111-1111-111111111111', 'owner');
  raise exception 'role escalation insert was allowed';
exception
  when undefined_table then null;
  when insufficient_privilege then null;
end $$;

do $$
begin
  update auth.users
     set email = 'escalated@example.test'
   where id = '11111111-1111-1111-1111-111111111111';
  raise exception 'member updated auth.users';
exception when insufficient_privilege then null;
end $$;

do $$
begin
  insert into public.desk_accounts (user_id) values ('11111111-1111-1111-1111-111111111111');
  raise exception 'member inserted a desk account directly';
exception when insufficient_privilege then null;
end $$;

do $$
begin
  perform public.insert_placement(0::smallint, 0::smallint, now(), '\x0102'::bytea);
  raise exception 'member executed insert_placement';
exception when insufficient_privilege then null;
end $$;

select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', false);

do $$
declare n int;
begin
  select count(*) into n from public.profiles;
  if n <> 0 then raise exception 'second member saw % profile rows', n; end if;
  update public.profiles set display_name = 'Hijack';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'second member updated % rows', n; end if;
end $$;

set role anon;

do $$
begin
  perform 1 from public.profiles;
  raise exception 'anonymous read of profiles was allowed';
exception when insufficient_privilege then null;
end $$;

do $$
begin
  perform 1 from public.placements;
  raise exception 'anonymous read of placements was allowed';
exception when insufficient_privilege then null;
end $$;

reset role;
set role service_role;
select public.insert_placement(0::smallint, 0::smallint, now(), '\x0102'::bytea);
