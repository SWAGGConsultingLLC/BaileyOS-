# Member accounts

This file is the review and production checklist for optional BaileyOS members on the Vercel map. It does not change the hosted project by itself. Do not run it against production from a pull request.

The map stays anonymous. A profile is a private row for the signed-in member. Email is not a join key for placements. New members do not receive steward, owner, or admin rights. Signal Ark's project is a different database and is not used here.

## What the current docs require

Checked against Supabase docs on 8 Nov 2026:

- Password signup uses `signUp` with `emailRedirectTo`. For a client-only app the JavaScript library's implicit flow delivers the session when the person opens the confirmation link. This app sets `flowType: 'implicit'` for that reason. Do not switch the hosted email template to a PKCE `token_hash` link unless the client flow is changed to match.
- Hosted projects confirm email by default. An unconfirmed signup has no session. The page says so and does not treat that person as signed in.
- Password recovery is `resetPasswordForEmail`, then `updateUser` after the `PASSWORD_RECOVERY` event. The recovery link must open on an allowed redirect URL.
- Resend uses `auth.resend` with `type: 'signup'`.
- A magic link for an existing account uses `signInWithOtp` with `shouldCreateUser: false`, so it does not create a member.
- RLS policies must use `auth.uid()`. `raw_user_meta_data` is user-editable and is not used for authorization. The profile table has no role column.
- `UPDATE` includes a `SELECT` policy so a member can update their own row.
- No new `SECURITY DEFINER` function was added. The `updated_at` trigger is security invoker.

## Reviewer checklist

- [ ] Diff does not add a service-role key, a publishable key, or a `.env` file.
- [ ] `profiles` policies are own-row only, and `anon` has no grants.
- [ ] Nothing in the profile path writes `user_roles` or reads Signal Ark.
- [ ] `POST /api/place` still has no email field. Linkage still requires the one-time link token.
- [ ] Mission Control no longer says services are connected or one click from authorization.
- [ ] Canon Burst copy says the quote is manual. The timer and notification code were not given a new cadence.
- [ ] `npm test` passed, and `npm run test:rls` passed on a local database. A passing client test is not RLS evidence.
- [ ] Production SQL and Auth settings below are still waiting for a person to apply them.

## Apply the migration

In the Supabase SQL editor for project `rxckxwdvhjszzuqsvxdk`, run `supabase/migrations/20261108142831_member_profiles.sql` once. Do this before telling members that profiles save. Until then, signup can succeed and profile save will fail closed.

`supabase/config.toml` is local configuration only. Editing it does not change the hosted project.

## Hosted Auth settings to confirm

In the dashboard, do not turn these off:

1. Authentication → Providers → Email stays enabled.
2. Confirm email stays enabled.
3. Minimum password length is at least 8.
4. Authentication → URL Configuration:
   - Site URL: `https://baileyos-app.vercel.app`
   - Redirect URLs include `https://baileyos-app.vercel.app` and `http://localhost:3000` for local development.
5. Do not add LinkedIn, Apple, or other OAuth providers for this change.
6. Do not disable signup. Anonymous map placement does not use Auth signup.

If the confirmation link opens and the app does not sign the person in, the redirect URL is missing from that allow list. Fix the allow list. Do not disable email confirmation to hide the problem.

## Rollback

```sql
drop policy if exists profiles_select_own on public.profiles;
drop policy if exists profiles_insert_own on public.profiles;
drop policy if exists profiles_update_own on public.profiles;
drop trigger if exists profiles_set_updated_at on public.profiles;
drop function if exists public.profiles_touch_updated_at();
drop table if exists public.profiles;
```

This removes member profiles only. It does not drop placements, desk links, or Auth users. Auth users created during the trial remain until someone deletes them in the dashboard. Deleting an Auth user does not by itself revoke a token they already hold.

## Tests

- `npm test` checks signup-versus-confirmed-session, unconfirmed sign-in, bad credentials, expiry, recovery wording, and the anonymous placement rules. Those are local fixtures. They do not prove RLS.
- `npm run test:rls` applies both migrations to a throwaway local Postgres database and checks two members, an anonymous role, and `service_role`. If `psql` cannot connect, the script exits 2. That result blocks profile rollout.
