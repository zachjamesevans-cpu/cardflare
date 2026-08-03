-- A store's timezone.
--
-- An event happens at a place, and the place has a timezone. That fact was
-- missing from the schema, and its absence was not merely a display problem:
-- `datetime-local` submits "2026-09-12T18:00" with no zone, and the server
-- read it in its own zone — UTC on Vercel. A store owner in Austin typing 6pm
-- stored 23:00 UTC's worth of intent as 18:00 UTC, which is one in the
-- afternoon locally. The event was in the database at the wrong instant, and
-- the dashboard then displayed that wrong instant accurately as "6:00 PM UTC".
--
-- Times themselves stay `timestamptz`. That was always right: an instant is an
-- instant. What was missing is the zone needed to turn a typed wall clock into
-- one, and to turn it back for display.
--
-- Kept on the store rather than on the event. A store runs its events in one
-- place, and asking for the zone on every event form would be a question with
-- the same answer every time — and one more thing to get wrong on a phone.
--
-- Defaulting to UTC preserves exactly today's behaviour for every existing
-- store and every event already stored: nothing moves until a store says where
-- it is.

begin;

alter table public.stores
  add column timezone text not null default 'UTC';

comment on column public.stores.timezone is
  'IANA timezone name for this store, e.g. America/Chicago. Used to turn a typed event time into an instant, and back for display.';

/*
 * Shape only, deliberately.
 *
 * Postgres knows its own timezone set through `pg_timezone_names`, but a CHECK
 * constraint cannot query a view, and the set that actually matters is the one
 * the *application* honours — every conversion here runs through `Intl` in
 * JavaScript, not through Postgres. So the real validation lives in
 * `src/lib/time/zone.ts`, which asks Intl whether it knows the name, and this
 * constraint only keeps obvious rubbish out of the column.
 */
alter table public.stores
  add constraint stores_timezone_shape
    check (timezone ~ '^[A-Za-z0-9_+/-]{3,64}$');

commit;
