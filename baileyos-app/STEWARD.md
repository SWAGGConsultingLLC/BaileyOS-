# Account activation

This file does not change the hosted project. Do not run the SQL from a pull request, and do not merge this branch in order to turn login on.

## Ordinary login ships first

Pull request 5 can merge and deploy by itself. It adds optional signup, email confirmation, and a private profile on the map. It does not grant steward. It does not need this branch, the workspace, or pull request 6.

## What is already true

Checked against the live map and the map database on 9 Nov 2026. No settings were changed.

- `https://baileyos-app.vercel.app` returns the map. `https://baileyos-app.vercel.app/workspace` is not deployed.
- `GET /api/placements` already reads the map database, so the Vercel project already has the map URL and service role.
- The map database has placement tables. It does not have `public.profiles` or `public.steward_grants`.
- Applied migrations are `canon_reads`, `canon_reads_part`, `revoke_rls_auto_enable_execute`, `baileyos_placements_v1`, and `baileyos_retention_cron`.
- One confirmed Auth user already exists. This check did not read that identity and did not grant it anything. Do not put that user on the steward list.

The current live map still uses the older sign-in link. The account screen arrives only when pull request 5 is deployed.

## Ordinary login

1. Merge pull request 5 into `main`. Do not merge this branch in that action.
2. Deploy that `main` commit to the existing Vercel project. The root directory stays `baileyos-app`. If the project already builds `main`, the merge is the deploy. No new environment variable is required for this step.
3. In the SQL editor for map project `rxckxwdvhjszzuqsvxdk`, run `baileyos-app/supabase/migrations/20261108142831_member_profiles.sql` once. If it stops because `public.profiles` already exists, stop. Do not alter that table.
4. In Authentication, leave Email on, leave Confirm email on, and keep the minimum password length at least 8. Site URL and redirect URLs include `https://baileyos-app.vercel.app`. `supabase/config.toml` does not change the hosted project.
5. Open `https://baileyos-app.vercel.app`. Create the ordinary account and the steward account as two separate signups. Open each confirmation message and return to the map. Save a display name while signed in. Sign out. The map still places people with no account.

If signup says an address is already registered, sign in from the map instead of creating a second user. Still do not grant the pre-existing user.

### Acceptance for this step

- Signed out, the map loads and placement still works.
- Before the confirmation message is opened, that signup is not signed in and cannot save a profile.
- After confirmation, that person can sign in and save a display name.
- The profile has no role. The ordinary account cannot act as steward.

### Rollback for this step

The profile rollback is in pull request 5 `AUTH.md`. It drops `public.profiles` only. Placements and Auth users stay.

## Steward login

Do this only after both accounts have confirmed on the deployed pull request 5 map.

This branch is based on the unmerged workspace branch. After pull request 5 is on `main`, rebase this branch onto `main`, then merge and deploy it. Deploying it earlier would ship the workspace without the new account screen. Deploying pull request 7 alone does not recognize a steward; that build stays closed.

1. Run `baileyos-app/supabase/migrations/20261109010133_steward_grants.sql` once in the same SQL editor. If it stops because `public.steward_grants` already exists, stop.
2. In Authentication → Users, copy the user id of the steward account. It is a UUID. Do not copy an address into the table.
3. Run this once, with that id:

```sql
insert into public.steward_grants (user_id)
values ('PASTE-STEWARD-USER-UUID');
```

4. Sign in on the map as the steward, then open `/workspace`. The page should say the server sees the steward. Replies there stay simulated.
5. Sign out. Sign in as the ordinary account and open `/workspace` again. The page should say ordinary member. That account cannot grant, reject, or release.

The server asks Auth who the access token is, then looks up that user id. An address, `user_metadata`, or `app_metadata` does not decide the role. A missing table keeps the workspace closed for everyone, including the future steward.

### Acceptance for this step

- The steward sign-in shows role steward. The ordinary sign-in shows role member.
- A request that claims role steward does not change the ordinary result.
- An unconfirmed sign-in is rejected even if a grant row exists.
- After the revoke statement below, the former steward is only a member on the next request.
- The page still says the replies are simulated.

### Rollback for this step

```sql
update public.steward_grants
set revoked_at = now()
where user_id = 'PASTE-STEWARD-USER-UUID'
  and revoked_at is null;
```

To remove the allow list:

```sql
drop table if exists public.steward_grants;
```

That does not drop profiles, placements, or Auth users. Deleting an Auth user does not by itself revoke a token they already hold. The next server check asks Auth again.

## What this run did not do

It did not merge, deploy, apply either migration, create a user, send mail, or insert a grant.
