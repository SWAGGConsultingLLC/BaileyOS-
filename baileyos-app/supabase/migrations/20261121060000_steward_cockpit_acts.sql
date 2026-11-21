-- Steward cockpit acts. Not part of the ruling chain and not a vote.
-- Run this by hand. A row does not change the lights and does not clear a road.
-- subject_id stays in this table. Public reads go through the service role and omit it.

create table public.steward_cockpit_acts (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null,
  act text not null,
  head_sha256 text,
  created_at timestamptz not null default now(),
  constraint steward_cockpit_acts_act check (act in ('approve', 'stand_down')),
  constraint steward_cockpit_acts_head check (head_sha256 is null or head_sha256 ~ '^[0-9a-f]{64}$')
);

create index steward_cockpit_acts_created on public.steward_cockpit_acts (created_at desc);

alter table public.steward_cockpit_acts enable row level security;

revoke all on table public.steward_cockpit_acts from public, anon, authenticated;

create function public.steward_cockpit_acts_reject_change()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  raise exception 'steward cockpit acts are append-only';
end;
$$;

create trigger steward_cockpit_acts_no_update
  before update on public.steward_cockpit_acts
  for each row execute function public.steward_cockpit_acts_reject_change();

create trigger steward_cockpit_acts_no_delete
  before delete on public.steward_cockpit_acts
  for each row execute function public.steward_cockpit_acts_reject_change();
