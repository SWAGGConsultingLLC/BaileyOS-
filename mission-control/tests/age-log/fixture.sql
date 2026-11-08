-- Local stand-in for the hosted age_assertions table. Not the hosted schema.
create table public.age_assertions (
  id bigint generated always as identity primary key,
  event text not null,
  verified boolean not null,
  token_hash text not null,
  issuer_id text not null,
  content_category text not null,
  source_id text not null,
  retain_until timestamptz not null,
  user_id uuid,
  asserter text,
  birthdate date,
  age integer
);

alter table public.age_assertions enable row level security;
alter table public.age_assertions force row level security;

grant insert on public.age_assertions to anon, authenticated;
grant usage, select on all sequences in schema public to anon, authenticated;

-- The existing Oasis rule, reproduced here so the new policy can be checked beside it.
create policy age_assertions_insert_oasis
  on public.age_assertions
  for insert
  to anon, authenticated
  with check (
    issuer_id = 'bailey-oasis'
    and user_id is null
    and asserter is null
    and birthdate is null
    and age is null
  );
