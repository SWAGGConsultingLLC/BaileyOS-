# Tamper-evident decision record

A Queen ruling can be sealed as a decision record. The seal shows the record was not altered after sealing. It does not show the decision was correct or that the data was accurate.

Say "tamper-evident decision records." Do not say the seal is proof, tamper-proof, or verified true.

## What is in the chain

`api/_ruling.py` builds `baileyos.ruling_record` 1.1. Verify still accepts 1.0 records, which hash the flat body with `record_sha256` removed.

Canonical form is sorted-key JSON, separators `,` and `:`, UTF-8, no trailing newline.

For 1.1 the chain formula is:

`R_n = H(canonical{ruling_n, F, R_prev})`

- `ruling_n` holds the Queen view, the verdicts and their `verdict_sha256`, dissent, missing voter names, freshness, the sanity result, the sequence number, and the note.
- `F` holds `feed_sha256`, `input_sha256`, and `report_sha256`. Those three fingerprints stay. `feed_sha256` is still id, title, agency, times, and kind — not coordinates.
- `R_prev` is `prev_record_sha256`, the previous record's `record_sha256`.
- `record_sha256` is `R_n`.

The first record in an empty log is an explicit genesis record: `queen.ruling` is `GENESIS`, `sequence_number` is 1, and `prev_record_sha256` is null. It is not a Queen ruling.

There is no user id, no location, and no coarsened area in the chain. Birth year, a self-identified label, and home region are not in the chain. The note inside every record says what the seal does and does not show.

## Sequencer

Records are written one at a time so two of them cannot claim the same parent.

`supabase/migrations/20261114043000_ruling_sequencer.sql` is a new file. It does not edit `20261114020000_ruling_records.sql`. The owner runs it by hand. It adds `sequence_number`, a unique index on that number, a unique index on `prev_record_sha256`, one genesis slot, and `append_ruling_record`. That function takes an advisory lock, locks the current head, and inserts only when the new parent and sequence are the next ones. A conflict asks the writer to read the head again and retry.

Direct inserts are revoked from the service role. The app calls the function.

## The 2-of-3 rule

The ruling names stay `NO_RULING`, `DISSENT`, `UNRESOLVED`, `CONSENSUS`, `PROVISIONAL`, and `PENDING`. No new name was added.

`CONSENSUS` needs all of these:

- at least 2 of 3 identical agree payloads (the verdict plus the input and report fingerprints; the reason text is sealed on the vote and is not part of the comparison)
- every feed fresh
- check C8 passed
- every claimed feed fingerprint recomputes

A disagreeing voter is sealed by name in `dissent`. A seat that has not voted is sealed by name in `missing_voters`. One missing voter does not block `CONSENSUS` when the other two payloads match. Uncertain and unavailable still do. A stale feed, a failed sanity check, or a fingerprint that does not recompute turns that `CONSENSUS` into `PROVISIONAL`. `DISSENT` still wins.

`pairwise_agreement` is a read-only 30-day rate for each pair of seats. It is returned with the lights and `used_for_quorum` is false. A high rate does not merge two voters. Per-voter `verdict_sha256` stays on the record so a later correlation matrix can be computed without changing the sealed fields.

## What is outside the chain

`public.ruling_requests` remembers which account asked for a record and the coarsened area used to fetch feeds (2 decimal degrees). The HUD delete button removes that person's rows. Rows older than 28 days are removed when a new link is written. Neither action rewrites `ruling_records` or any `prev_record_sha256`.

## Apply the migrations

1. Open the Supabase SQL editor for this project.
2. If `baileyos-app/supabase/migrations/20261114020000_ruling_records.sql` has not been applied, run that file first. Do not edit it.
3. Run `baileyos-app/supabase/migrations/20261114043000_ruling_sequencer.sql` as one script.
4. If a unique index fails, two existing rows already share a parent. Stop. Do not delete rows from the app. Inspect `prev_record_sha256` and ask before any repair.
5. Check `select sequence_number, prev_record_sha256, ruling from public.ruling_records order by sequence_number;`
6. Leave the table empty if it is empty. The next convene writes the genesis record through the function. Do not paste a genesis row by hand.

Until both files are applied, the HUD still returns the record and says the log is not configured. The Landing Stone lights stay PENDING.

## Check a record

`/data-nest/verify` and `POST /api/data-nest/verify` recompute the seal, `queen_sha256`, and each `verdict_sha256`. A 1.0 record is checked with the 1.0 flat hash. A 1.1 record is checked with the chain formula. No sign-in. A match means the pasted bytes were not altered after sealing. It does not mean the Queen was right or that a feed was accurate.

## Three lights

`GET /api/data-nest/continuity` is read-only. `landing-stone/index.html` (also served at `/landing-stone` on the Next app) paints three lights from that JSON:

- Consensus: a count such as `1 of 1 CONSENSUS over 30 days`. GREEN when at least two thirds of the rulings in the window are CONSENSUS. RED when the window is below that. PENDING when there is nothing to count.
- Feed Health: fresh and sane across those rulings. PENDING when a ruling has no sanity check.
- Chain Integrity: every seal recomputes, each parent matches the previous record, and no two records share a parent.

Each light is GREEN, RED, or PENDING, with one plain sentence.

The continuity lock is `LOCKED` only when all three are green and today's head is anchored outside this system. Anchoring is not built, so the lock stays `PENDING — anchor not published`. If the endpoint cannot be read, or the database is not configured, every light is PENDING. The page does not invent a count.

The response includes the head hash, `computed_at`, and the pairwise rates. Those rates do not change the lock.

## Daily head

`GET /api/data-nest/anchor` returns the UTC day, the newest `record_sha256` (the head), the count, and `daily_sha256` over `{day, head_sha256, record_count}`.

`publish_anchor` does not post. Nothing in the app calls it on a timer.

## Step 4 — Git anchor (not built)

`publish_git_anchor(anchor, approval)` in `api/_roadmap.py` is the only function that may later copy a daily head into a public Git commit.

- `anchor` is the object from `daily_anchor`.
- `approval` must be a fresh `{ "owner_approved": true, "day": "<that same UTC day>" }`. One approval does not cover the next day.
- The function returns `published: false` and `implemented: false`. It does not commit, push, or open a network connection.
- Nothing calls it on a timer. `auto_post` is false.
- A second witness such as Sigstore Rekor can come after Git. It is not this step.

## Step 5 — QR and SAS trip handshake (not built)

`trip_handshake_interface` documents the later handshake. It does not generate keys or redeem a code.

- Ephemeral X25519. The private keys stay on the two devices.
- A random nonce with an expiry and a single redemption.
- Both devices confirm before either joins. One device cannot add the other person.
- Members stay visible. Either device can leave with one tap.
- Trip genesis is `G = H(canonical{pub_A, pub_B, nonce})`.

Two people on the same trip can share a route and the public feeds. Each phone still orders and phrases results from its own on-device profile. Profiles are not shared, and they are not written into these records.

## How the simulation would use a record later

The status page already reads the lights. The agent simulation does not.

1. Add a control on `landing-stone/simulation/index.html`: "Load a decision record".
2. Fetch `GET /api/data-nest/rulings/<record_sha256>` or paste the JSON.
3. Call `POST /api/data-nest/verify` before the text enters the shared log. If the seal does not match, the drill does not start.
4. Give the slots the ruling label, the report fingerprint, and the freshness results. Do not give them an account id, a location, or a chat transcript.
5. Demo mode stays a drill. A decision record is a sealed check, not an order.
