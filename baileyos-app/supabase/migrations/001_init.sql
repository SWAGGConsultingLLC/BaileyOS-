-- BaileyOS v1. Raw coordinates never reach the database: the API route quantizes first.

create table placements (
  id          bigint generated always as identity primary key,
  band_km     smallint not null check (band_km >= 0),
  sector      smallint not null check (sector between 0 and 359),
  placed_hour timestamptz not null,           -- truncated to the hour, server clock
  dedupe_key  bytea not null unique,          -- HMAC(secret, device_token || window_start)
  created_at  timestamptz not null default now()
);
create index placements_created_idx on placements (created_at);

create table placed_count (
  id    boolean primary key default true check (id),
  total bigint not null default 0
);
insert into placed_count default values;

-- Optional, opt-in. No foreign key on purpose: retention can delete a placement without touching the account.
create table desk_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  linked_placement_id bigint
);

-- Count is derived from inserts only. Nothing else writes it.
create function bump_placed_count() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update placed_count set total = total + 1 where id;
  return new;
end $$;
create trigger placements_count_aiu after insert on placements
  for each row execute function bump_placed_count();

-- Idempotent insert. Returns the new id, or null if the dedupe key already exists.
create function insert_placement(p_band smallint, p_sector smallint, p_hour timestamptz, p_key bytea)
returns bigint language plpgsql security definer set search_path = public as $$
declare v_id bigint;
begin
  insert into placements (band_km, sector, placed_hour, dedupe_key)
  values (p_band, p_sector, p_hour, p_key)
  on conflict (dedupe_key) do nothing
  returning id into v_id;
  return v_id;
end $$;

-- Retention: delete old rows, keep the aggregate, drop dangling links.
create function purge_old_placements(p_days int default 90) returns int
language plpgsql security definer set search_path = public as $$
declare v_n int;
begin
  with gone as (
    delete from placements where created_at < now() - make_interval(days => p_days) returning id
  )
  select count(*) into v_n from gone;
  update desk_accounts set linked_placement_id = null
   where linked_placement_id is not null
     and not exists (select 1 from placements p where p.id = linked_placement_id);
  return v_n;
end $$;

-- Lock everything down. Only the server (service_role) touches these.
alter table placements    enable row level security;
alter table placed_count  enable row level security;
alter table desk_accounts enable row level security;

revoke all on placements, placed_count, desk_accounts from anon, authenticated;
revoke execute on function insert_placement(smallint, smallint, timestamptz, bytea) from public, anon, authenticated;
revoke execute on function purge_old_placements(int) from public, anon, authenticated;
revoke execute on function bump_placed_count() from public, anon, authenticated;
grant  execute on function insert_placement(smallint, smallint, timestamptz, bytea) to service_role;
grant  execute on function purge_old_placements(int) to service_role;

-- Optional, if pg_cron is enabled:
-- select cron.schedule('baileyos-retention', '17 3 * * *', $$select purge_old_placements(90)$$);
