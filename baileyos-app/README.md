# BAILEYOS v1

Show up. Get placed. A privacy-first placement map centered on downtown Grand Junction, CO.

## Run
1. `npm install`
2. Create a Supabase project. Run `supabase/migrations/001_init.sql` in the SQL editor. For member profiles, also run `supabase/migrations/20261108142831_member_profiles.sql`. That second file is not applied to production by this repository.
3. Copy `.env.example` to `.env.local` and fill it in. Generate `PLACEMENT_SECRET` with `openssl rand -hex 32`. Copy the publishable key from the Supabase dashboard. Do not commit either secret.
4. `npm run dev`

An account is optional. Without `NEXT_PUBLIC_SUPABASE_ANON_KEY`, the account form says sign-in is not configured and placement still works. See `AUTH.md` before calling member signup finished.

## Set the center
`NEXT_PUBLIC_ORIGIN_LAT` / `NEXT_PUBLIC_ORIGIN_LON`. Default is 39.0639, -108.5506 (approx Main & 5th). To use the Grand Mesa instead, set 39.0433, -108.0617. Range, band size and sector size are `NEXT_PUBLIC_MAX_KM`, `NEXT_PUBLIC_BAND_KM`, `NEXT_PUBLIC_SECTOR_DEG`.

## How a placement works
1. Browser sends lat/lon, accuracy, a random device token and a timestamp to `POST /api/place` over TLS.
2. The route validates (ranges, accuracy ≤ 1 km, clock skew ±15 min, rate limits), computes distance and bearing from the origin, and snaps to a band and a sector.
3. Dedupe key = HMAC-SHA256(`PLACEMENT_SECRET`, token + ":" + window start). The window and the hour come from the server clock.
4. The route calls `insert_placement(band, sector, hour, key)`. The database only ever receives the quantized values. `ON CONFLICT (dedupe_key) DO NOTHING` makes repeats a no-op ("duplicate").
5. A trigger on `placements` increments `placed_count`. No client path writes the count.
6. The map draws each record at a random point inside its cell, re-jittered on every render.

## Privacy: what is and isn't guaranteed
- Raw coordinates are never written to the database or logged by this code. They exist in the API route's memory during the request. Your host or proxy may log request bodies; turn that off.
- Cells are 5 km by 30°. Sparse cells can still single someone out; raise `NEXT_PUBLIC_BAND_KM` to 10 while data is thin.
- The device token is client-generated, so someone can rotate it to place more than once. The rate limits slow that down. They don't stop it.
- Rate limiting is in-memory. On serverless or several instances, replace `lib/rateLimit.ts` with Redis/Upstash.
- Linking a placement to a desk account is explicit and reversible, but while linked, the account is associated with a 5 km cell. The link token comes from the placement response. The same email does not attach an old placement.
- A member profile stores a display name and an optional short bio. Other people and anonymous visitors cannot read it. It does not grant a role.
- Retention: check-ins older than 28 days are removed. The Compass schedule calls `purge_old_placements(28)`. `POST /api/retention` with `Authorization: Bearer $CRON_SECRET` uses `RETENTION_DAYS`, or 28 when that variable is blank.
- Secret rotation: changing `PLACEMENT_SECRET` changes every future dedupe key, so people can place once more in the current window. Rotate on a quiet boundary. Link tokens also change, so existing links can't be extended.

## Status
Migration and a daily pg_cron purge (03:17 UTC, 28 days) are already applied to the BaileyOS Signal Finder Compass project. Use `.env.local.example` and fill in the service-role key and PLACEMENT_SECRET.
