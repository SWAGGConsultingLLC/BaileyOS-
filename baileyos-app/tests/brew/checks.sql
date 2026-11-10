\set ON_ERROR_STOP on

insert into public.consensus_votes (question_id, subject_id, option)
  values ('001', '11111111-1111-4111-8111-111111111111', 'A');

do $$
begin
  insert into public.consensus_votes (question_id, subject_id, option)
    values ('001', '11111111-1111-4111-8111-111111111111', 'B');
  raise exception 'a second vote was stored';
exception when unique_violation then null;
end $$;

do $$
begin
  update public.consensus_votes set option = 'B' where question_id = '001';
  raise exception 'a vote update was stored';
exception when others then
  if sqlerrm not like '%append-only%' then raise; end if;
end $$;

do $$
begin
  delete from public.consensus_votes where question_id = '001';
  raise exception 'a vote delete was stored';
exception when others then
  if sqlerrm not like '%append-only%' then raise; end if;
end $$;

set role anon;
do $$
begin
  insert into public.consensus_votes (question_id, subject_id, option)
    values ('001', '22222222-2222-4222-8222-222222222222', 'C');
  raise exception 'anon recorded a vote';
exception when insufficient_privilege then null;
end $$;

reset role;
set role authenticated;
do $$
begin
  update public.consensus_votes set option = 'C' where question_id = '001';
  raise exception 'authenticated updated a vote';
exception when insufficient_privilege then null;
end $$;

reset role;
do $$
declare n int;
begin
  select count(*) into n from public.consensus_votes where option = 'A';
  if n <> 1 then raise exception 'expected one vote, saw %', n; end if;
end $$;
