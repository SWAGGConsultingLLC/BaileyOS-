-- Private member profile for the BaileyOS map.
-- Authorization is auth.uid() only. raw_user_meta_data and raw_app_meta_data are not read.
-- There is no role column. A row here does not grant steward, owner, or admin.
-- Security invoker only. No security definer function is added in this migration.

create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  bio text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_display_name_len check (
    char_length(btrim(display_name)) between 1 and 80
    and display_name = btrim(display_name)
    and display_name !~ '[[:cntrl:]]'
  ),
  constraint profiles_bio_len check (
    bio is null
    or (
      char_length(btrim(bio)) between 1 and 280
      and bio = btrim(bio)
      and bio !~ '[[:cntrl:]]'
    )
  )
);

comment on table public.profiles is
  'Own-row member profile. Policies compare user_id to auth.uid(). User metadata is not an authorization source.';

create function public.profiles_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

comment on function public.profiles_touch_updated_at() is
  'Sets updated_at. Security invoker. Does not read JWT metadata and does not grant privileges.';

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.profiles_touch_updated_at();

alter table public.profiles enable row level security;
alter table public.profiles force row level security;

revoke all on table public.profiles from public, anon, authenticated;
revoke all on function public.profiles_touch_updated_at() from public, anon, authenticated;

grant select, insert, update on table public.profiles to authenticated;
grant execute on function public.profiles_touch_updated_at() to authenticated;

create policy profiles_select_own
  on public.profiles
  for select
  to authenticated
  using (user_id = auth.uid());

create policy profiles_insert_own
  on public.profiles
  for insert
  to authenticated
  with check (user_id = auth.uid());

create policy profiles_update_own
  on public.profiles
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
