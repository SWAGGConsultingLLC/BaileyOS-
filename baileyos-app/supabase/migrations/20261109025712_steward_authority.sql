-- Refuses to replace an existing steward authority table.
do $$
begin
  if to_regclass('public.verified_suite_subjects') is not null
     or to_regclass('public.steward_grants') is not null
     or to_regclass('public.steward_audit') is not null then
    raise exception 'steward authority tables already exist; this migration will not alter them';
  end if;
end $$;

-- Verified 360 subject ids only. No address column. No link to map auth.users.
create table public.verified_suite_subjects (
  subject_id uuid primary key,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

-- Steward is a separate server grant of a verified subject. No foreign key, no address.
create table public.steward_grants (
  subject_id uuid primary key,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  constraint steward_grants_revoke_after_grant check (revoked_at is null or revoked_at >= granted_at)
);

create table public.steward_audit (
  id bigint generated always as identity primary key,
  subject_id uuid not null,
  action text not null,
  created_at timestamptz not null default now(),
  constraint steward_audit_action check (action in ('verified', 'grant', 'revoke'))
);

comment on table public.steward_grants is
  'Server-only steward grant by verified 360 subject id. Not a map auth user and not an address.';

alter table public.verified_suite_subjects enable row level security;
alter table public.verified_suite_subjects force row level security;
alter table public.steward_grants enable row level security;
alter table public.steward_grants force row level security;
alter table public.steward_audit enable row level security;
alter table public.steward_audit force row level security;

revoke all on table public.verified_suite_subjects from public, anon, authenticated, service_role;
revoke all on table public.steward_grants from public, anon, authenticated, service_role;
revoke all on table public.steward_audit from public, anon, authenticated, service_role;

grant select, insert, update on table public.verified_suite_subjects to service_role;
grant select on table public.steward_grants to service_role;
grant select, insert on table public.steward_audit to service_role;
