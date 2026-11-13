-- Neighborhood visibility. Not applied to Compass by this change. Brian reviews it first.
--
-- The map route decides which pins to return. This file does two things the route cannot:
--   1. The old public_map_checkins(text[]) listed every shared name in the requested hexes.
--      It now returns the people count and no pins, so an older server cannot list a neighborhood.
--   2. map_pins_for_viewer(text[], uuid) is the same rule in the database, for the service role only.
--      A null viewer, or a viewer checked into a different neighborhood, gets no pins.
--      Each person contributes one pin, the newest check-in in the last 28 days.
--      A pin without a shared card has a null name and photo.
--   3. One signed-in person can have only one placement row.
--
-- To reverse after this app no longer depends on these objects:
--   drop function if exists public.map_pins_for_viewer(text[], uuid);
--   drop index if exists public.placements_one_subject_idx;
-- Restoring the old public_map_checkins body would again list every shared name. Do not do that
-- unless that public listing is intentional.

create or replace function public.public_map_checkins(p_hexes text[])
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'people', coalesce((select people from public.checkin_live_tallies where id), 0),
    'neighborhoods', '[]'::jsonb
  );
$$;

comment on function public.public_map_checkins(text[]) is
  'People count only. Pins are limited to a viewer who has checked into that neighborhood.';

revoke all on function public.public_map_checkins(text[]) from public, anon, authenticated;
grant execute on function public.public_map_checkins(text[]) to service_role;

create or replace function public.map_pins_for_viewer(p_hexes text[], p_viewer uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with latest as (
    select distinct on (subject_id)
      subject_id,
      h3,
      id
    from public.placements
    where subject_id is not null
      and h3 ~ '^[0-9a-f]{15}$'
      and created_at >= now() - interval '28 days'
    order by subject_id, created_at desc, id desc
  ),
  viewer as (
    select h3
    from latest
    where p_viewer is not null
      and subject_id = p_viewer
      and h3 = any(coalesce(p_hexes, array[]::text[]))
  ),
  shown as (
    select l.h3, l.id, c.display_name, c.photo_url, c.profile_url
    from latest l
    join viewer v on v.h3 = l.h3
    left join public.placement_cards c on c.placement_id = l.id
  )
  select jsonb_build_object(
    'people', coalesce((select people from public.checkin_live_tallies where id), 0),
    'neighborhoods', case
      when p_viewer is null then '[]'::jsonb
      else coalesce((
        select jsonb_agg(jsonb_build_object(
          'hex', n.h3,
          'pins', n.pins
        ) order by n.h3)
        from (
          select h3,
            jsonb_agg(jsonb_build_object(
              'name', display_name,
              'photo', photo_url,
              'profileUrl', profile_url
            ) order by display_name nulls last, id) as pins
          from shown
          group by h3
        ) n
      ), '[]'::jsonb)
    end
  );
$$;

comment on function public.map_pins_for_viewer(text[], uuid) is
  'Pins in the viewer''s own neighborhood. Service role only. One newest pin per person.';

revoke all on function public.map_pins_for_viewer(text[], uuid) from public, anon, authenticated;
grant execute on function public.map_pins_for_viewer(text[], uuid) to service_role;

create unique index if not exists placements_one_subject_idx
  on public.placements (subject_id)
  where subject_id is not null;
