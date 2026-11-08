#!/usr/bin/env bash
# Real Postgres RLS checks. This is not a mocked client.
# Exit 2 means the database could not run. That blocks rollout of the profile table.
set -euo pipefail
cd "$(dirname "$0")/../.."

if ! command -v psql >/dev/null 2>&1; then
  echo "RLS tests BLOCKED: psql is not installed. Profile rollout is not verified."
  exit 2
fi

PSQL=(psql -v ON_ERROR_STOP=1 -X -q)
if [ "$(id -u)" -ne 0 ] && [ "$(whoami)" != "postgres" ]; then
  if sudo -u postgres psql -c "select 1" >/dev/null 2>&1; then
    PSQL=(sudo -u postgres psql -v ON_ERROR_STOP=1 -X -q)
  fi
fi

if ! "${PSQL[@]}" -d postgres -c "select 1" >/dev/null 2>&1; then
  echo "RLS tests BLOCKED: Postgres is not accepting connections. Profile rollout is not verified."
  exit 2
fi

DB="baileyos_rls_$$"
cleanup() {
  "${PSQL[@]}" -d postgres -c "drop database if exists ${DB}" >/dev/null 2>&1 || true
}
trap cleanup EXIT

"${PSQL[@]}" -d postgres -c "drop database if exists ${DB}" >/dev/null
"${PSQL[@]}" -d postgres -c "create database ${DB}"
"${PSQL[@]}" -d "$DB" -f tests/rls/prelude.sql
"${PSQL[@]}" -d "$DB" -f supabase/migrations/001_init.sql
"${PSQL[@]}" -d "$DB" -f supabase/migrations/20261108142831_member_profiles.sql
"${PSQL[@]}" -d "$DB" -f tests/rls/checks.sql
echo "RLS tests passed on local database ${DB} (roles anon, authenticated, service_role)."
