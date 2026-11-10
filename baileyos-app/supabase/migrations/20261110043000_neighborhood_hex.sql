-- Neighborhood hexes. The old band and sector columns stay so this can be reversed.
-- Historical rows are snapped to the hex that contains the center of their old wedge.
-- Their phone marker stays empty, so they do not count toward the crowd of 3.
--
-- To reverse after the new app is no longer writing these columns:
--   drop function if exists public.insert_placement_hex(smallint, smallint, timestamptz, bytea, text, bytea);
--   drop index if exists placements_h3_created_idx;
--   alter table public.placements drop constraint if exists placements_h3_shape;
--   alter table public.placements drop column if exists phone_key, drop column if exists h3;

alter table public.placements add column if not exists h3 text;
alter table public.placements add column if not exists phone_key bytea;

alter table public.placements drop constraint if exists placements_h3_shape;
alter table public.placements add constraint placements_h3_shape
  check (h3 is null or h3 ~ '^[0-9a-f]{15}$');

comment on column public.placements.h3 is
  'H3 resolution 7 neighborhood. About 2.5 km across. Not an exact point.';
comment on column public.placements.phone_key is
  'Server-only HMAC of the device token with no time window. Never return this to a client.';

-- Wedge centers from the old map origin, computed with the same H3 resolution 7 snap as the app.
update public.placements set h3 = '87269c1aeffffff' where band_km = 0 and sector = 0 and h3 is null;
update public.placements set h3 = '87269c185ffffff' where band_km = 0 and sector = 9 and h3 is null;

do $$
begin
  if exists (select 1 from public.placements where h3 is null) then
    raise exception 'a saved check-in has no neighborhood hex';
  end if;
  if exists (select 1 from public.placements where phone_key is not null) then
    raise exception 'a historical check-in was given a phone marker';
  end if;
end $$;

create index if not exists placements_h3_created_idx on public.placements (h3, created_at);

create or replace function public.insert_placement_hex(
  p_band smallint,
  p_sector smallint,
  p_hour timestamptz,
  p_key bytea,
  p_h3 text,
  p_phone bytea
) returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id bigint;
begin
  if p_h3 is null or p_h3 !~ '^[0-9a-f]{15}$' or p_phone is null then
    raise exception 'neighborhood hex required';
  end if;
  insert into public.placements (band_km, sector, placed_hour, dedupe_key, h3, phone_key)
  values (p_band, p_sector, p_hour, p_key, p_h3, p_phone)
  on conflict (dedupe_key) do nothing
  returning id into v_id;
  return v_id;
end $$;

revoke all on function public.insert_placement_hex(smallint, smallint, timestamptz, bytea, text, bytea)
  from public, anon, authenticated;
grant execute on function public.insert_placement_hex(smallint, smallint, timestamptz, bytea, text, bytea)
  to service_role;
