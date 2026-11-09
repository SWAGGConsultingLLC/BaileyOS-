#!/usr/bin/env bash
# Local permission checks for steward authority. Does not contact the hosted database.
set -euo pipefail
cd "$(dirname "$0")/../.."

if ! command -v psql >/dev/null 2>&1; then
  echo "Steward authority tests BLOCKED: psql is not installed."
  exit 2
fi

PSQL=(psql -v ON_ERROR_STOP=1 -X -q)
if [ "$(id -u)" -ne 0 ] && [ "$(whoami)" != "postgres" ]; then
  if sudo -u postgres psql -c "select 1" >/dev/null 2>&1; then
    PSQL=(sudo -u postgres psql -v ON_ERROR_STOP=1 -X -q)
  fi
fi

if ! "${PSQL[@]}" -d postgres -c "select 1" >/dev/null 2>&1; then
  echo "Steward authority tests BLOCKED: Postgres is not accepting connections."
  exit 2
fi

DB="baileyos_steward_auth_$$"
cleanup() {
  "${PSQL[@]}" -d postgres -c "drop database if exists ${DB}" >/dev/null 2>&1 || true
}
trap cleanup EXIT

"${PSQL[@]}" -d postgres -c "drop database if exists ${DB}" >/dev/null
"${PSQL[@]}" -d postgres -c "create database ${DB}"
"${PSQL[@]}" -d "$DB" -f tests/steward-authority/prelude.sql
"${PSQL[@]}" -d "$DB" -f supabase/migrations/20261109025712_steward_authority.sql
if "${PSQL[@]}" -d "$DB" -f supabase/migrations/20261109025712_steward_authority.sql >/dev/null 2>&1; then
  echo "Steward authority tests failed: a second apply was allowed."
  exit 1
fi
"${PSQL[@]}" -d "$DB" -f tests/steward-authority/checks.sql
echo "Steward authority tests passed on local database ${DB}."
