-- Sealed Queen ruling records. Append-only. Public read. No precise user location in the body.

create table public.ruling_records (
  record_sha256 text primary key,
  prev_record_sha256 text,
  ruling text not null,
  created_at timestamptz not null,
  body jsonb not null,
  constraint ruling_records_sha check (record_sha256 ~ '^[0-9a-f]{64}$'),
  constraint ruling_records_prev check (prev_record_sha256 is null or prev_record_sha256 ~ '^[0-9a-f]{64}$')
);

create index ruling_records_created_at on public.ruling_records (created_at desc);

alter table public.ruling_records enable row level security;

create policy ruling_records_public_read on public.ruling_records
  for select
  to anon, authenticated
  using (true);

create function public.ruling_records_reject_change()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  raise exception 'ruling records are append-only';
end;
$$;

create trigger ruling_records_no_update
  before update on public.ruling_records
  for each row execute function public.ruling_records_reject_change();

create trigger ruling_records_no_delete
  before delete on public.ruling_records
  for each row execute function public.ruling_records_reject_change();

grant select on public.ruling_records to anon, authenticated;

-- Who asked, and their coarsened area. Not part of the chain.
-- Deleting these rows does not delete or rewrite ruling_records.
create table public.ruling_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  record_sha256 text not null,
  coarse_lat double precision,
  coarse_lon double precision,
  created_at timestamptz not null default now(),
  constraint ruling_requests_sha check (record_sha256 ~ '^[0-9a-f]{64}$')
);

create index ruling_requests_user on public.ruling_requests (user_id, created_at desc);

alter table public.ruling_requests enable row level security;

revoke all on table public.ruling_requests from public, anon, authenticated;
