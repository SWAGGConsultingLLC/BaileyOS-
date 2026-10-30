# BaileyOS — Landing Stone

This repository holds **Landing Stone**, the continuity module for operation Red Robin (BaileyOS), and the **81 Canon** Bible.

Signal Finder stays a separate tool at [signal-beacon-compass.lovable.app](https://signal-beacon-compass.lovable.app/).

## View it

- [Landing Stone](landing-stone/index.html)
- [81 Canon](canon/index.html) — the broader canon, $0.00. Sixty-seven books are the public-domain King James text. Fourteen books stay descriptions because no public-domain English text is included.

GitHub Pages, from the repository root: [Landing Stone](https://swaggconsultingllc.github.io/BaileyOS-/landing-stone/) and [81 Canon](https://swaggconsultingllc.github.io/BaileyOS-/canon/).

## Supabase

The reading log uses the project **BaileyOS Signal Finder Compass** (`rxckxwdvhjszzuqsvxdk`). Opening a chapter writes a row to `public.canon_reads`. The table has row-level security: anyone may insert and read that log, and nothing else. The publishable key is in [`canon/config.js`](canon/config.js).

