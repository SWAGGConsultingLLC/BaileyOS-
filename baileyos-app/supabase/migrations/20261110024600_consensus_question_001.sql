-- Question #001 votes. Append-only. No client access. The salt never leaves the server.

create table public.consensus_questions (
  id text primary key,
  prompt text not null,
  constraint consensus_questions_id check (id = '001')
);

insert into public.consensus_questions (id, prompt) values (
  '001',
  'Before any shared AI answer from 360° Brewing is released publicly, should it first be reviewed by outside auditors, or can the Steward release it as long as every step is permanently logged?'
);

create table public.consensus_votes (
  question_id text not null references public.consensus_questions (id),
  subject_id uuid not null,
  option text not null,
  created_at timestamptz not null default now(),
  constraint consensus_votes_option check (option in ('A', 'B', 'C')),
  unique (question_id, subject_id)
);

create table public.consensus_salts (
  question_id text primary key references public.consensus_questions (id),
  salt text not null,
  constraint consensus_salts_len check (char_length(salt) >= 32)
);

create function public.consensus_reject_change()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  raise exception 'consensus votes are append-only';
end;
$$;

create trigger consensus_votes_no_update
  before update on public.consensus_votes
  for each row execute function public.consensus_reject_change();

create trigger consensus_votes_no_delete
  before delete on public.consensus_votes
  for each row execute function public.consensus_reject_change();

create trigger consensus_salts_no_update
  before update on public.consensus_salts
  for each row execute function public.consensus_reject_change();

create trigger consensus_salts_no_delete
  before delete on public.consensus_salts
  for each row execute function public.consensus_reject_change();

alter table public.consensus_questions enable row level security;
alter table public.consensus_questions force row level security;
alter table public.consensus_votes enable row level security;
alter table public.consensus_votes force row level security;
alter table public.consensus_salts enable row level security;
alter table public.consensus_salts force row level security;

revoke all on table public.consensus_questions from public, anon, authenticated, service_role;
revoke all on table public.consensus_votes from public, anon, authenticated, service_role;
revoke all on table public.consensus_salts from public, anon, authenticated, service_role;
revoke all on function public.consensus_reject_change() from public, anon, authenticated;

grant select on table public.consensus_questions to service_role;
grant select, insert on table public.consensus_votes to service_role;
grant select, insert on table public.consensus_salts to service_role;
