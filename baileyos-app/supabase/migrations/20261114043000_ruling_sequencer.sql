-- Sequencer for tamper-evident decision records.
-- Run this after 20261114020000_ruling_records.sql. Do not edit that file.
-- The owner runs this by hand in the Supabase SQL editor. It does not run on deploy.
--
-- One writer at a time. Two records cannot claim the same parent.
-- The first row in an empty table must be the explicit genesis record
-- (queen.ruling = GENESIS, sequence_number = 1, prev_record_sha256 null).
-- A table that already has rows is numbered in created_at order and is not rewritten.

alter table public.ruling_records add column if not exists sequence_number bigint;

with bounds as (
  select coalesce(max(sequence_number), 0) as floor
  from public.ruling_records
),
ranked as (
  select record_sha256, row_number() over (order by created_at asc, record_sha256 asc) as n
  from public.ruling_records
  where sequence_number is null
)
update public.ruling_records as row
set sequence_number = bounds.floor + ranked.n
from ranked, bounds
where row.record_sha256 = ranked.record_sha256
  and row.sequence_number is null;

alter table public.ruling_records alter column sequence_number set not null;

alter table public.ruling_records drop constraint if exists ruling_records_sequence_positive;
alter table public.ruling_records
  add constraint ruling_records_sequence_positive check (sequence_number > 0);

create unique index if not exists ruling_records_sequence_unique
  on public.ruling_records (sequence_number);

create unique index if not exists ruling_records_prev_unique
  on public.ruling_records (prev_record_sha256)
  where prev_record_sha256 is not null;

create unique index if not exists ruling_records_one_genesis
  on public.ruling_records ((1))
  where prev_record_sha256 is null;

create or replace function public.append_ruling_record(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  head public.ruling_records%rowtype;
  new_seq bigint;
  new_prev text;
  new_hash text;
  new_ruling text;
  new_at timestamptz;
begin
  perform pg_advisory_xact_lock(814271);
  select * into head
  from public.ruling_records
  order by sequence_number desc
  limit 1
  for update;

  new_hash := payload->>'record_sha256';
  new_prev := nullif(payload->>'prev_record_sha256', '');
  new_ruling := coalesce(payload#>>'{queen,ruling}', '');
  new_at := (payload->>'created_at')::timestamptz;
  new_seq := (payload->>'sequence_number')::bigint;

  if new_hash is null or new_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'record hash missing' using errcode = '23514';
  end if;
  if new_seq is null or new_seq < 1 then
    raise exception 'sequence missing' using errcode = '23514';
  end if;

  if head.record_sha256 is null then
    if new_prev is not null or new_seq <> 1 or new_ruling <> 'GENESIS' then
      raise exception 'chain head moved' using errcode = '40001';
    end if;
  else
    if new_prev is distinct from head.record_sha256 or new_seq is distinct from head.sequence_number + 1 then
      raise exception 'chain head moved' using errcode = '40001';
    end if;
  end if;

  insert into public.ruling_records (
    record_sha256, prev_record_sha256, ruling, created_at, body, sequence_number
  ) values (
    new_hash, new_prev, new_ruling, new_at, payload, new_seq
  );
  return payload;
exception
  when unique_violation then
    raise exception 'chain head moved' using errcode = '40001';
end;
$$;

revoke all on function public.append_ruling_record(jsonb) from public, anon, authenticated;
grant execute on function public.append_ruling_record(jsonb) to service_role;

revoke insert on table public.ruling_records from anon, authenticated, service_role;
