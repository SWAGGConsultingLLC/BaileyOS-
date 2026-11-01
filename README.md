# BaileyOS

This repository holds the BaileyOS pages for operation Red Robin: **Landing Stone**, **Signal Ark**, and the **81 Canon** Bible. The home screen links to each app.

Signal Finder stays a separate tool at [signal-beacon-compass.lovable.app](https://signal-beacon-compass.lovable.app/). Landing Stone and Signal Finder used to share one app. They are now separate. Landing Stone stays in this repo.

Expected home URL: [https://swaggconsultingllc.github.io/BaileyOS-/](https://swaggconsultingllc.github.io/BaileyOS-/)

## Apps

- **Landing Stone** — continuity module for operation Red Robin. [`landing-stone/`](landing-stone/). Pages: [https://swaggconsultingllc.github.io/BaileyOS-/landing-stone/](https://swaggconsultingllc.github.io/BaileyOS-/landing-stone/)
- **Signal Ark** — beneficiary dashboard and built-in 81 Canon reader. Beneficiary records need a sign-in. [`signal-ark/`](signal-ark/). Pages: [https://swaggconsultingllc.github.io/BaileyOS-/signal-ark/](https://swaggconsultingllc.github.io/BaileyOS-/signal-ark/)
- **81 Canon** — the broader canon, $0.00. Sixty-seven books are the public-domain King James text. Fourteen books stay descriptions because no public-domain English text is included. [`canon/`](canon/). Pages: [https://swaggconsultingllc.github.io/BaileyOS-/canon/](https://swaggconsultingllc.github.io/BaileyOS-/canon/)
- **Signal Finder** — compass, bearing, about 500 m range, device orientation, and signal simulation. It is not in this repository. [https://signal-beacon-compass.lovable.app/](https://signal-beacon-compass.lovable.app/)

## GitHub Pages

Pages is published by the **Publish Bailey OS** workflow in [`.github/workflows/pages.yml`](.github/workflows/pages.yml). It runs on every push to `main`, and it can be started by hand. The job checks out the repository and uploads the repository root (`path: .`) as the Pages artifact, then deploys that artifact. [`.nojekyll`](.nojekyll) is in the root, so Pages serves the files as they are. That includes the home screen, `landing-stone/`, `signal-ark/`, and `canon/`.

Open [`index.html`](index.html) in a browser for the same home screen locally.

## Signal Ark sign-in

Beneficiary records are private. They are stored in Supabase (table `ark_beneficiaries`) and are only shown after sign-in. Anyone can view the scripture and signal pages without signing in.

To use the beneficiary dashboard, a person needs two things:

1. **A Supabase account (email + password)** in the BaileyOS Supabase project. The project owner adds it in the Supabase dashboard under *Authentication → Users → Add user*.
2. **A role in the `user_roles` table** set to `owner` or `steward`, linked to that account's user ID. Without that row, the person can sign in but sees no data.

Then open Signal Ark, go to the **Dashboard** tab, and sign in with that email and password. The page uses only the public Supabase key. Database rules allow access only for signed-in owners and stewards.

## Supabase

The 81 Canon reading log uses the project **BaileyOS Signal Finder Compass** (`rxckxwdvhjszzuqsvxdk`). Opening a chapter writes a row to `public.canon_reads`. The table has row-level security: anyone may insert and read that log, and nothing else. The publishable key is in [`canon/config.js`](canon/config.js).
