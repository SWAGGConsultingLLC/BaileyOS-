-- Epoch and idempotency for the ruling sequencer.
-- Run this after 20261114043000_ruling_sequencer.sql. Do not edit the older files.
-- The owner runs this by hand. chain_epoch lives in the record body.
-- An idempotency key replays the same sealed row. A different seal with the same key is rejected.
-- A gap in sequence_number is a broken chain. The app shows Chain Integrity red.

alter table public.ruling_records add column if not exists idempotency_key text;
alter table public.ruling_records add column if not exists chain_epoch integer;

update public.ruling_records
set chain_epoch = 1
where chain_epoch is null;

alter table public.ruling_records alter column chain_epoch set default 1;

create unique index if not exists ruling_records_idempotency_unique
  on public.ruling_records (idempotency_key)
  where idempotency_key is not null;

create or replace function public.append_ruling_record(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  head public.ruling_records%rowtype;
  existing public.ruling_records%rowtype;
  new_seq bigint;
  new_prev text;
  new_hash text;
  new_ruling text;
  new_at timestamptz;
  new_key text;
  new_epoch integer;
begin
  perform pg_advisory_xact_lock(814271);

  new_hash := payload->>'record_sha256';
  new_prev := nullif(payload->>'prev_record_sha256', '');
  new_ruling := coalesce(payload#>>'{queen,ruling}', '');
  new_at := (payload->>'created_at')::timestamptz;
  new_seq := (payload->>'sequence_number')::bigint;
  new_key := nullif(payload->>'idempotency_key', '');
  new_epoch := coalesce((payload->>'chain_epoch')::integer, 1);

  if new_hash is null or new_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'record hash missing' using errcode = '23514';
  end if;
  if new_seq is null or new_seq < 1 then
    raise exception 'sequence missing' using errcode = '23514';
  end if;
  if new_epoch is distinct from 1 then
    raise exception 'chain epoch mismatch' using errcode = '23514';
  end if;

  if new_key is not null then
    select * into existing
    from public.ruling_records
    where idempotency_key = new_key;
    if existing.record_sha256 is not null then
      if existing.record_sha256 = new_hash then
        return existing.body;
      end if;
      raise exception 'idempotency key reused' using errcode = '23514';
    end if;
  end if;

  select * into head
  from public.ruling_records
  order by sequence_number desc
  limit 1
  for update;

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
    record_sha256, prev_record_sha256, ruling, created_at, body, sequence_number, idempotency_key, chain_epoch
  ) values (
    new_hash, new_prev, new_ruling, new_at, payload, new_seq, new_key, new_epoch
  );
  return payload;
exception
  when unique_violation then
    raise exception 'chain head moved' using errcode = '40001';
end;
$$;

revoke all on function public.append_ruling_record(jsonb) from public, anon, authenticated;
grant execute on function public.append_ruling_record(jsonb) to service_role;
