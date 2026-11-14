# Tamper-evident decision record

A Queen ruling can be sealed as a decision record. The seal shows the record was not altered after sealing. It does not show the decision was correct or that the data was accurate.

Nothing in `landing-stone/` reads these records yet.

## What is in the chain

`api/_ruling.py` builds `baileyos.ruling_record` 1.0. Canonical form is sorted-key JSON, separators `,` and `:`, UTF-8, no trailing newline. `record_sha256` is SHA-256 of that form with `record_sha256` removed.

The chain holds only:

- `input_sha256` and `report_sha256` (fingerprints of the validator input and report)
- `feed_sha256` (fingerprint of each source payload: id, title, agency, times, and kind — not coordinates)
- validator votes and each vote's `verdict_sha256`
- freshness results and the per-layer max ages
- the Queen outcome, `queen_sha256`, and `source_ruling_sha256`
- `created_at` and optional `prev_record_sha256`

There is no user id, no location, and no coarsened area in the chain. The note inside every record says what the seal does and does not show.

## What is outside the chain

`public.ruling_requests` remembers which account asked for a record and the coarsened area used to fetch feeds (2 decimal degrees). The HUD delete button removes that person's rows. Rows older than 28 days are removed when a new link is written. Neither action rewrites `ruling_records` or any `prev_record_sha256`.

Apply `supabase/migrations/20261114020000_ruling_records.sql` in the Supabase SQL editor. Until then the HUD still returns the record and says the log is not configured.

## Check a record

`/data-nest/verify` and `POST /api/data-nest/verify` recompute `record_sha256`, `queen_sha256`, and each `verdict_sha256`. No sign-in. A match means the pasted bytes were not altered after sealing. It does not mean the Queen was right or that a feed was accurate.

## Daily head

`GET /api/data-nest/anchor` returns the UTC day, the newest `record_sha256` (the head), the count, and `daily_sha256` over `{day, head_sha256, record_count}`.

`publish_anchor` in `api/_ruling.py` is the hook for a later step that would copy `daily_sha256` to a place this project does not control: a public transparency log, a public GitHub commit or gist, or an X post. The function does not post. Nothing in the app calls it. Publishing needs the owner's approval every time.

Trust: the seal guards against outsiders changing a record after it was sealed. An anchor kept outside this Vercel project and this Supabase database is what would guard against our own system.

## How Landing Stone would use a record later

Do this in a later change.

1. Add a control on `landing-stone/simulation/index.html`: "Load a decision record".
2. Fetch `GET /api/data-nest/rulings/<record_sha256>` or paste the JSON.
3. Call `POST /api/data-nest/verify` before the text enters the shared log. If the seal does not match, the drill does not start.
4. Give the slots the ruling label, the report fingerprint, and the freshness results. Do not give them an account id, a location, or a chat transcript.
5. The continuity lock on `landing-stone/index.html` can cite a record by hash later. A record does not unlock the stone.
6. Demo mode stays a drill. A decision record is a sealed check, not an order.
