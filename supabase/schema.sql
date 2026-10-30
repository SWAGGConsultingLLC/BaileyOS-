-- 81 Canon reading log for Bailey OS.
-- Not applied. Paste this into the Supabase SQL editor, then set the URL
-- and anon key in canon/config.js. The page does not call Supabase until both are set.

create table if not exists public.canon_reads (
  id bigint generated always as identity primary key,
  book int not null check (book between 1 and 81),
  chapter int not null check (chapter >= 1),
  created_at timestamptz not null default now()
);

alter table public.canon_reads enable row level security;

create policy "anyone can add a read" on public.canon_reads
  for insert to anon, authenticated with check (true);

create policy "anyone can read the log" on public.canon_reads
  for select to anon, authenticated using (true);
