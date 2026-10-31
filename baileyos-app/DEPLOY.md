# Deploy the BaileyOS map on Vercel

This folder is the placement map. GitHub Pages still hosts the rest of the site (the home screen, Landing Stone, and the 81 Canon). Vercel hosts only this map.

You do not need to write code. You fill in a few settings in the Vercel and Supabase websites.

## 1. Import the GitHub repo

1. Sign in at [vercel.com](https://vercel.com).
2. Choose **Add New…** → **Project**.
3. Import this GitHub repository (`SWAGGConsultingLLC/BaileyOS-`).
4. Open **Root Directory** and set it to `baileyos-app`.
5. Leave the framework as **Next.js**. Leave the build command as Vercel fills it in.

Do this before the first deploy. If Root Directory stays the repository root, Vercel will not find this app.

## 2. Add the environment variables

In the same Vercel import screen (or later under **Project → Settings → Environment Variables**), add the names below. Paste each value into Vercel only. Do not put secret values in git, in this file, or in a chat.

The public map settings, the public Supabase address, and the publishable anon key are already written in `.env.local.example` in this folder. Copy those. The two secret values are not in that file. Get them as described below.

**Required**

| Name | What to enter |
| --- | --- |
| `NEXT_PUBLIC_ORIGIN_LAT` | Map center latitude. Copy from `.env.local.example`. |
| `NEXT_PUBLIC_ORIGIN_LON` | Map center longitude. Copy from `.env.local.example`. |
| `NEXT_PUBLIC_MAX_KM` | How far from the center someone can be placed. Copy from `.env.local.example`. |
| `NEXT_PUBLIC_BAND_KM` | Size of each distance band. Copy from `.env.local.example`. |
| `NEXT_PUBLIC_SECTOR_DEG` | Width of each direction slice. Copy from `.env.local.example`. |
| `NEXT_PUBLIC_SUPABASE_URL` | Public Supabase project URL. Copy from `.env.local.example`, or from Supabase → **Project Settings → API**. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Publishable anon key (safe in the browser). Copy from `.env.local.example`, or the anon key on that same Supabase API page. |
| `SUPABASE_SERVICE_ROLE_KEY` | Secret. Supabase → **Project Settings → API** → service role key. Never commit this. |
| `PLACEMENT_SECRET` | Secret. A long random string, at least 32 characters. On a computer you can run `openssl rand -hex 32` and paste the result into Vercel only. |

**Optional** (leave blank unless you need them)

| Name | What it does |
| --- | --- |
| `CRON_SECRET` | A password for the cleanup address `/api/retention`. The database already deletes old rows on a schedule, so you can leave this blank. |
| `DEDUPE_WINDOW_HOURS` | Hours before the same device can place again. Blank uses 24. |
| `RETENTION_DAYS` | How many days a placement is kept. Blank uses 90. |

Apply the variables to **Production**. Add the same ones to **Preview** if you want Vercel’s preview links to work too.

Then click **Deploy**.

The database tables for this map are already on the BaileyOS Supabase project. You do not need to run SQL for that project. If you ever point the variables at a brand-new Supabase project, run `supabase/migrations/001_init.sql` in the Supabase SQL editor first.

## 3. Allow the live site in Supabase login

After Vercel finishes, copy the live address it gives you (it looks like `https://something.vercel.app`).

1. Open the Supabase dashboard for this project.
2. Go to **Authentication → URL Configuration**.
3. Set **Site URL** to that live address.
4. Add the same address under **Redirect URLs**.

Login emails send people back to this address. If it is missing, the map still opens, but the email login link will not return them to the map.

## 4. Point the home screen at the real address

The GitHub Pages home screen uses `https://baileyos.vercel.app` as a stand-in. After you know the real Vercel address, replace that link in the repository file `index.html` (there is a TODO comment beside it) and let GitHub Pages publish the change.
