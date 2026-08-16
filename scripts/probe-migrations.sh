#!/bin/bash
#
# Replays every migration, in order, into a throwaway database on real
# PostgreSQL — then replays them again with `tests/sql/*-seed.sql` in place
# just before the migration under test, and checks the result.
#
# The reason the second pass exists: a migration whose data step is a `do`
# block over rows that do not exist succeeds against an empty database while
# being wrong. `merge_player_sessions` referenced two columns that were not
# there and the empty run said "ok", because plpgsql only parses a statement
# the first time it runs one. Seeded rows are what caught it.
#
# Usage, from a machine with PostgreSQL 16 and an unprivileged user to own
# the cluster:
#
#   PGHOST=/home/pgprobe bash scripts/probe-migrations.sh
#
# Optional: SCENARIO names one of the pairs in tests/sql (seed + assert).
set -euo pipefail

REPO=$(cd "$(dirname "$0")/.." && pwd)
PSQL="psql -h ${PGHOST:-/home/pgprobe} -U ${PGUSER:-postgres} -v ON_ERROR_STOP=1 -q"
SCENARIO=${SCENARIO:-duplicate-join}
UNDER_TEST=${UNDER_TEST:-20260918090000_one_room_identity_per_account.sql}

# The Supabase surface the migrations lean on, and nothing more. Everything
# else they need, they create themselves — which is the point of the probe.
bootstrap() {
  $PSQL -d "$1" <<'SQL' >/dev/null
create extension if not exists pgcrypto;
create extension if not exists pg_trgm;
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin bypassrls;
  end if;
end $$;
create schema auth;
create table auth.users (id uuid primary key default gen_random_uuid(), email text);
create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
create schema storage;
create table storage.buckets (
  id text primary key, name text, public boolean default false,
  file_size_limit bigint, allowed_mime_types text[]
);
SQL
}

fresh() {
  $PSQL -d postgres -c "drop database if exists $1" >/dev/null
  $PSQL -d postgres -c "create database $1" >/dev/null
  bootstrap "$1"
}

echo "1. Every migration, in order, on an empty database"
fresh cfprobe
for f in "$REPO"/supabase/migrations/*.sql; do
  printf '   %s ... ' "$(basename "$f")"
  $PSQL -d cfprobe -f "$f" >/dev/null
  echo ok
done

seed="$REPO/tests/sql/$SCENARIO-seed.sql"
assert="$REPO/tests/sql/$SCENARIO-assert.sql"

if [ ! -f "$seed" ]; then
  echo "No scenario at $seed — stopping after the empty pass."
  exit 0
fi

echo
echo "2. The $SCENARIO scenario: seeded before $UNDER_TEST"
fresh cfscenario
for f in "$REPO"/supabase/migrations/*.sql; do
  [ "$(basename "$f")" = "$UNDER_TEST" ] && continue
  $PSQL -d cfscenario -f "$f" >/dev/null
done
$PSQL -d cfscenario -f "$seed" >/dev/null
$PSQL -d cfscenario -f "$REPO/supabase/migrations/$UNDER_TEST" >/dev/null
$PSQL -d cfscenario -f "$assert"
