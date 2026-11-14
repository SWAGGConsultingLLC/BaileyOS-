# BaileyOS

This repository holds the BaileyOS pages for operation Red Robin: **Landing Stone**, **Signal Ark**, and the **81 Canon** Bible. The home screen links to each app.

Signal Finder stays a separate tool at [signal-beacon-compass.lovable.app](https://signal-beacon-compass.lovable.app/). Landing Stone and Signal Finder used to share one app. They are now separate. Landing Stone stays in this repo.

Expected home URL: [https://swaggconsultingllc.github.io/BaileyOS-/](https://swaggconsultingllc.github.io/BaileyOS-/)

## Apps

- **Landing Stone** — continuity module for operation Red Robin, with an agent simulation. [`landing-stone/`](landing-stone/). Pages: [https://swaggconsultingllc.github.io/BaileyOS-/landing-stone/](https://swaggconsultingllc.github.io/BaileyOS-/landing-stone/)
- **Signal Ark** — beneficiary dashboard and built-in 81 Canon reader. Beneficiary records need a sign-in. [`signal-ark/`](signal-ark/). Pages: [https://swaggconsultingllc.github.io/BaileyOS-/signal-ark/](https://swaggconsultingllc.github.io/BaileyOS-/signal-ark/)
- **81 Canon** — the broader canon, $0.00. Sixty-seven books are the public-domain King James text. Fourteen books stay descriptions because no public-domain English text is included. [`canon/`](canon/). Pages: [https://swaggconsultingllc.github.io/BaileyOS-/canon/](https://swaggconsultingllc.github.io/BaileyOS-/canon/)
- **Signal Finder** — compass, bearing, about 500 m range, device orientation, and signal simulation. It is not in this repository. [https://signal-beacon-compass.lovable.app/](https://signal-beacon-compass.lovable.app/)

## Landing Stone agent simulation

[`landing-stone/simulation/`](landing-stone/simulation/) is a static drill linked from the Landing Stone status page. The continuity-lock readout stays on [`landing-stone/`](landing-stone/). It shows three lights from `GET /api/data-nest/continuity` when that endpoint answers. If it does not, the lights stay PENDING. The lock is LOCKED only when all three are green and today's head is anchored outside this system. Anchoring is not built, so the lock stays PENDING. **Slot A is Grok (xAI)** and **Slot B is Gemini (Google)**. **Slot C is optional GitHub Models.** The turn order is A, then B, then C when Slot C is included.

The written ruleset is `SIM_CONFIG` at the top of [`landing-stone/simulation/simulation.js`](landing-stone/simulation/simulation.js). The page shows those rules and enforces them: scenario and objective, strict turn order through the included slots, a round limit, per-turn word and character limits, a referee check after every turn, and one shared log that every included slot sees. Start, pause, step, and reset control the run. Export writes the transcript as JSON and as text, without API keys or tokens.

Open it from the Landing Stone page, at [https://swaggconsultingllc.github.io/BaileyOS-/landing-stone/simulation/](https://swaggconsultingllc.github.io/BaileyOS-/landing-stone/simulation/), or at [https://os.swaggconsulting.com/landing-stone/simulation/](https://os.swaggconsulting.com/landing-stone/simulation/). Locally, open `landing-stone/simulation/index.html` in a browser. There is no build step.

**Demo mode** runs the full order with placeholder lines labeled `[DEMO PLACEHOLDER · NOT A LIVE MODEL]`, including Slot C when it is included. With the default word limit, the round-2 Slot A line is over the limit so the referee flag shows up.

**Live mode** does not ask a visitor for a key. Each turn POSTs to `https://baileyos-app.vercel.app/api/oracle` (`PROXY_BASE` in `simulation.js`) with `{ provider, model, system, messages }`. `provider` is `grok`, `gemini`, or `github`. The reply text comes back from that route. The keys stay in the baileyos-app Vercel project. A **429** pauses the run and says so; Step or Start tries the same slot again after a wait. **Use my own key** is collapsed on each slot. Opening it sends that slot from the browser instead: Slot A to `https://api.x.ai/v1/chat/completions` (default `grok-4.7`), Slot B to Generative Language `generateContent` (default `gemini-3.8-flash`), Slot C to `https://models.github.ai/inference/chat/completions` (default `openai/gpt-4o-mini`). A key typed there stays in tab memory and is written to `localStorage` only if **Remember on this device** is ticked. A missing key, CORS failure, auth failure, or rate limit shows inline on that slot. GitHub retired the Models catalog on July 30, 2026, so a direct Slot C call can fail even when the proxy path is the one a visitor uses.

The referee and turn order can be checked locally with `node --test landing-stone/simulation/engine.test.mjs`.

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
