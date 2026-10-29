# BaileyOS — Landing Stone

This repository holds **Landing Stone**, the continuity module for operation Red Robin (BaileyOS). Landing Stone and Signal Finder used to share one app. They are now separate: this repo is Landing Stone only.

Signal Finder stays the general tool (compass, bearing, about 500 m range, device orientation, and signal simulation). It is not in this repository. Open it at [signal-beacon-compass.lovable.app](https://signal-beacon-compass.lovable.app/).

## View it

- Open [`landing-stone/index.html`](landing-stone/index.html) in a browser.
- With GitHub Pages enabled on the `main` branch from the repository root (`/`), the module is served at `/landing-stone/`. The site root redirects there.

Expected Pages URL: [https://swaggconsultingllc.github.io/BaileyOS-/landing-stone/](https://swaggconsultingllc.github.io/BaileyOS-/landing-stone/)

## Signal Ark

**Signal Ark** is the beneficiary dashboard and 81 Canon reader. It lives in [`signal-ark/index.html`](signal-ark/index.html).

Expected Pages URL: [https://swaggconsultingllc.github.io/BaileyOS-/signal-ark/](https://swaggconsultingllc.github.io/BaileyOS-/signal-ark/)

### Signing in

Beneficiary records are private. They are stored in Supabase (table `ark_beneficiaries`) and are only shown after sign-in. Anyone can view the scripture and signal pages without signing in.

To use the beneficiary dashboard, a person needs two things:

1. **A Supabase account (email + password)** in the BaileyOS Supabase project. The project owner adds it in the Supabase dashboard under *Authentication → Users → Add user*.
2. **A role in the `user_roles` table** set to `owner` or `steward`, linked to that account's user ID. Without that row, the person can sign in but sees no data.

Then open Signal Ark, go to the **Dashboard** tab, and sign in with that email and password. The page uses only the public Supabase key. Database rules allow access only for signed-in owners and stewards.
