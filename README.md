# BaileyOS

This repository holds the BaileyOS pages for operation Red Robin. The home screen links to each app.

Expected home URL: [https://swaggconsultingllc.github.io/BaileyOS-/](https://swaggconsultingllc.github.io/BaileyOS-/)

With GitHub Pages enabled on the `main` branch from the repository root (`/`), open [`index.html`](index.html) for the same screen locally.

## Apps

- **Landing Stone** — continuity module for operation Red Robin. [`landing-stone/`](landing-stone/). Pages: [https://swaggconsultingllc.github.io/BaileyOS-/landing-stone/](https://swaggconsultingllc.github.io/BaileyOS-/landing-stone/)
- **Signal Ark** — beneficiary dashboard and 81 Canon reader. Beneficiary records need a sign-in. [`signal-ark/`](signal-ark/). Pages: [https://swaggconsultingllc.github.io/BaileyOS-/signal-ark/](https://swaggconsultingllc.github.io/BaileyOS-/signal-ark/)
- **Signal Finder** — compass, bearing, about 500 m range, device orientation, and signal simulation. It is not in this repository. [https://signal-beacon-compass.lovable.app/](https://signal-beacon-compass.lovable.app/)

Landing Stone and Signal Finder used to share one app. They are now separate. Landing Stone stays in this repo. Signal Finder stays the general tool.

## Signal Ark sign-in

Beneficiary records are private. They are stored in Supabase (table `ark_beneficiaries`) and are only shown after sign-in. Anyone can view the scripture and signal pages without signing in.

To use the beneficiary dashboard, a person needs two things:

1. **A Supabase account (email + password)** in the BaileyOS Supabase project. The project owner adds it in the Supabase dashboard under *Authentication → Users → Add user*.
2. **A role in the `user_roles` table** set to `owner` or `steward`, linked to that account's user ID. Without that row, the person can sign in but sees no data.

Then open Signal Ark, go to the **Dashboard** tab, and sign in with that email and password. The page uses only the public Supabase key. Database rules allow access only for signed-in owners and stewards.
