#!/usr/bin/env bash
# Local Postgres only. Does not connect to hosted Supabase.
set -euo pipefail
cd "$(dirname "$0")/../.."

if ! command -v psql >/dev/null 2>&1; then
  echo "age-log RLS BLOCKED: psql is not installed"
  exit 2
fi

PSQL=(psql -v ON_ERROR_STOP=1 -X -q)
if [ "$(id -u)" -ne 0 ] && [ "$(whoami)" != "postgres" ]; then
  if sudo -u postgres psql -c "select 1" >/dev/null 2>&1; then
    PSQL=(sudo -u postgres psql -v ON_ERROR_STOP=1 -X -q)
  fi
fi

if ! "${PSQL[@]}" -d postgres -c "select 1" >/dev/null 2>&1; then
  echo "age-log RLS BLOCKED: Postgres is not accepting connections"
  exit 2
fi

DB="archive_age_$$"
cleanup() { "${PSQL[@]}" -d postgres -c "drop database if exists ${DB}" >/dev/null 2>&1 || true; }
trap cleanup EXIT

"${PSQL[@]}" -d postgres -c "drop database if exists ${DB}" >/dev/null
"${PSQL[@]}" -d postgres -c "create database ${DB}"
"${PSQL[@]}" -d "$DB" -c "do \$\$ begin if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if; if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if; end \$\$; grant anon to current_user; grant authenticated to current_user;"
"${PSQL[@]}" -d "$DB" -f tests/age-log/fixture.sql
"${PSQL[@]}" -d "$DB" -f supabase/migrations/20261108145258_archive_age_assertion_issuer.sql
"${PSQL[@]}" -d "$DB" -f tests/age-log/checks.sql
echo "age-log RLS passed on local database ${DB}."
