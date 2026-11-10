\set ON_ERROR_STOP on

insert into public.placements (band_km, sector, placed_hour, dedupe_key)
  values (0, 1, now(), '\x01');

insert into public.placement_cards (placement_id, display_name, photo_url)
  values (1, 'Ada Lovelace', 'https://media.licdn.com/photo.jpg');

set role anon;
do $$
begin
  perform 1 from public.placement_cards;
  raise exception 'anon read a check-in card';
exception when insufficient_privilege then null;
end $$;

do $$
begin
  insert into public.placement_cards (placement_id, display_name) values (1, 'Other');
  raise exception 'anon wrote a check-in card';
exception when insufficient_privilege then null;
end $$;

reset role;
do $$
declare n int;
begin
  select count(*) into n from information_schema.columns
   where table_schema = 'public' and table_name = 'placement_cards' and column_name = 'role';
  if n <> 0 then raise exception 'a check-in card has a role column'; end if;
end $$;
