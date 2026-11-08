\set ON_ERROR_STOP on

set role anon;
select set_config('request.jwt.claim.sub', '', false);

insert into public.age_assertions (event, verified, token_hash, issuer_id, content_category, source_id, retain_until)
values ('yes', true, repeat('ab', 16), 'bailey-oasis', 'general', '/oasis', now() + interval '90 days');

do $$
begin
  insert into public.age_assertions (event, verified, token_hash, issuer_id, content_category, source_id, retain_until, age)
  values ('yes', true, repeat('ac', 16), 'bailey-oasis', 'general', '/oasis', now() + interval '90 days', 18);
  raise exception 'oasis policy accepted an age';
exception when insufficient_privilege then null;
end $$;

insert into public.age_assertions (event, verified, token_hash, issuer_id, content_category, source_id, retain_until)
values ('shown', false, repeat('cd', 16), 'bailey-archive', 'general', '/mission-control/living-archive.html', now() + interval '90 days');

do $$
begin
  insert into public.age_assertions (event, verified, token_hash, issuer_id, content_category, source_id, retain_until, birthdate)
  values ('yes', true, repeat('ef', 16), 'bailey-archive', 'general', '/mission-control/living-archive.html', now() + interval '90 days', '2000-01-01');
  raise exception 'archive policy accepted a birth date';
exception when insufficient_privilege then null;
end $$;

do $$
begin
  insert into public.age_assertions (event, verified, token_hash, issuer_id, content_category, source_id, retain_until, asserter)
  values ('yes', true, repeat('11', 16), 'bailey-archive', 'general', '/mission-control/living-archive.html', now() + interval '90 days', 'someone');
  raise exception 'archive policy accepted an asserter';
exception when insufficient_privilege then null;
end $$;

do $$
begin
  insert into public.age_assertions (event, verified, token_hash, issuer_id, content_category, source_id, retain_until)
  values ('yes', true, repeat('22', 16), 'bailey-other', 'general', '/mission-control/living-archive.html', now() + interval '90 days');
  raise exception 'an unknown issuer was inserted';
exception when insufficient_privilege then null;
end $$;

reset role;

do $$
declare oasis int;
begin
  select count(*) into oasis from pg_policies
   where schemaname = 'public' and tablename = 'age_assertions' and policyname = 'age_assertions_insert_oasis';
  if oasis <> 1 then raise exception 'oasis policy was removed'; end if;
end $$;
