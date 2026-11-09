-- Refuses to replace an existing steward allow list.
do $$
begin
  if to_regclass('public.steward_grants') is not null then
    raise exception 'public.steward_grants already exists; this migration will not alter it';
  end if;
end $$;

-- Server-only steward allow list. The key is auth.users.id.
-- There is no address column and no role claim.
-- anon and authenticated receive no privileges and no policies.
-- The map service role may read. It may not insert. Rows are written from the SQL editor.

create table public.steward_grants (
  user_id uuid primary key references auth.users (id) on delete cascade,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  constraint steward_grants_revoke_after_grant check (revoked_at is null or revoked_at >= granted_at)
);

comment on table public.steward_grants is
  'Server-only steward allow list by auth user id. No address. No policies for anon or authenticated.';

alter table public.steward_grants enable row level security;
alter table public.steward_grants force row level security;

revoke all on table public.steward_grants from public, anon, authenticated, service_role;
grant select on table public.steward_grants to service_role;
