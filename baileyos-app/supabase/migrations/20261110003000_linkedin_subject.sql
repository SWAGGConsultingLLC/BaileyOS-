-- Pair each verified map auth user with the LinkedIn subject returned by this project's Auth server.
alter table public.verified_suite_subjects
  add column if not exists provider text,
  add column if not exists provider_sub text;

alter table public.verified_suite_subjects
  drop constraint if exists verified_suite_subjects_provider_check;
alter table public.verified_suite_subjects
  add constraint verified_suite_subjects_provider_check
  check (provider is null or provider = 'linkedin_oidc');

alter table public.verified_suite_subjects
  drop constraint if exists verified_suite_subjects_provider_sub_check;
alter table public.verified_suite_subjects
  add constraint verified_suite_subjects_provider_sub_check
  check (provider_sub is null or provider_sub ~ '^[A-Za-z0-9._-]{1,255}$');

alter table public.verified_suite_subjects
  drop constraint if exists verified_suite_subjects_pair_check;
alter table public.verified_suite_subjects
  add constraint verified_suite_subjects_pair_check
  check ((provider is null and provider_sub is null) or (provider is not null and provider_sub is not null));

create unique index if not exists verified_suite_subjects_provider_sub_key
  on public.verified_suite_subjects (provider, provider_sub);

comment on table public.verified_suite_subjects is
  'Map auth user id plus the LinkedIn subject verified by the map Auth server. No address. Not a steward grant.';
