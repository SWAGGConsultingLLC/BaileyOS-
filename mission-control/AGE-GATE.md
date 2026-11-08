# Living Archive self-attestation

This is a review note. It does not publish GitHub Pages, change swaggconsulting.com, or apply SQL.

The Archive at `mission-control/living-archive.html` asks its own question. Oasis at `https://www.swaggconsulting.com/oasis` stores `bailey_agegate` on that site only. A yes there does not open the Archive, and a yes here does not open Oasis. `bailey:agegate` and `window.BaileyAgeGate` also stay on the page that fired them. Someone who visits both origins can see both prompts. That is expected.

A yes is self-confirmed. It is not proof of age or identity, and it is not a security barrier. Choosing no stores a non-passing note when storage works, then sends the browser to `https://www.google.com/`. A remembered yes lasts 28 days. Expired, garbage, or unreadable storage asks again.

## Logging is not live

The page posts to `age_assertions` on project `aklxxrmytplbrjqunkpg` with issuer `bailey-archive`. The public Oasis client only shows inserts for issuer `bailey-oasis`, and the parent review found that the anon policy allows that issuer only, with user, asserter, birth date, and age left empty. This page does not pretend to be Oasis, and it does not put those identity fields in the body.

Until someone applies `supabase/migrations/20261108145258_archive_age_assertion_issuer.sql` on that project, the insert is expected to be rejected. The gate still works. The status line says the log was not stored. Do not treat a rejected insert as a recorded event.

The migration only adds a permissive insert policy. It does not drop the Oasis policy, does not create the table, and does not grant new table privileges. It aborts if `age_assertions` or the columns Oasis already writes are missing, or if it cannot find an identity column to force null.

## Apply later, by hand

1. In the SQL editor, confirm `public.age_assertions` exists and still has the Oasis insert policy.
2. Run the migration file once.
3. Open the Archive, choose yes, and confirm the status says the log was accepted. A rejected status means the policy did not apply. Do not hide that.

## Rollback

```sql
drop policy if exists age_assertions_insert_archive on public.age_assertions;
```

That removes the Archive insert path only. It does not drop `age_assertions` or the Oasis policy.
