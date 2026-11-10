-- Optional public name and photo for one check-in. No role. No exact coordinates.
create table public.placement_cards (
  placement_id bigint primary key references public.placements (id) on delete cascade,
  display_name text not null,
  photo_url text,
  profile_url text,
  updated_at timestamptz not null default now(),
  constraint placement_cards_name check (
    char_length(btrim(display_name)) between 1 and 80
    and display_name = btrim(display_name)
    and display_name !~ '[[:cntrl:]]'
  ),
  constraint placement_cards_photo check (photo_url is null or photo_url like 'https://%'),
  constraint placement_cards_profile check (profile_url is null or profile_url like 'https://%')
);

comment on table public.placement_cards is
  'Name and photo a person chose to show with one rough check-in. Not a role.';

create function public.placement_id_for_key(p_key bytea)
returns bigint
language sql
stable
set search_path = public
as $$
  select id from public.placements where dedupe_key = p_key
$$;

alter table public.placement_cards enable row level security;
alter table public.placement_cards force row level security;

revoke all on table public.placement_cards from public, anon, authenticated, service_role;
revoke all on function public.placement_id_for_key(bytea) from public, anon, authenticated;

grant select, insert, update, delete on table public.placement_cards to service_role;
grant execute on function public.placement_id_for_key(bytea) to service_role;
