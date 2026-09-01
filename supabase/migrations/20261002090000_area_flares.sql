-- A Flare that is not standing in a room.
--
-- The founder, on what Local is for: "people can see all flares nearby
-- and can message people directly. should be intuitive." Local could not
-- do that, and the reason was two tables down rather than in the tab.
--
-- `flares.event_id` has been `not null` since the first week: a Flare
-- belonged to an event, an event belonged to a store, and the only way to
-- post one was to be standing at a counter with a QR code. That is the
-- right shape for the four nights a month somebody is at locals. It is
-- the wrong shape for the other twenty-six, which is exactly the gap
-- Local was created to fill — and Local inherited the constraint, so the
-- tab asked "what is everybody near me looking for" of a table that could
-- only answer for people who were in a room.
--
-- So a Flare gets a second, equally legitimate shape:
--
--   at a store   event_id + player_session_id, posted to that board
--   in an area   player_id + posted_postal_code, posted to nobody's board
--
-- ONE TABLE, and the check constraint is what keeps that honest. A second
-- table would mean every read of "Flares near me" joins both forever, and
-- the two would drift on the day somebody adds a column to one.
--
-- AN AREA FLARE NEEDS AN ACCOUNT, and that is not a paywall. A guest
-- session expires in thirty days and has no inbox; the whole point of the
-- feature is that somebody can answer, and `flare_threads` has always
-- required accounts on both ends for the same reason. A guest at a store
-- can still post to that store's board exactly as before.
--
-- WHERE AN AREA FLARE SITS is the player's own five-digit ZIP, resolved to
-- a ZCTA centroid at read time. Not a device coordinate: this row outlives
-- the request that made it, and the standing rule is that a precise
-- position rides one request and is never stored. A ZIP is miles across,
-- it is the same anchor the profile already uses, and it is the coarsest
-- thing that can still answer "near me".

begin;

/* -------------------------------------------------------------------------- */
/* 1. The second shape                                                        */
/* -------------------------------------------------------------------------- */

alter table public.flares
  alter column event_id drop not null,
  alter column player_session_id drop not null;

alter table public.flares
  /* The account that posted it. Null for a Flare posted to a board, where
     the session is the identity and the account behind it is resolved
     through `player_sessions.player_id`. */
  add column if not exists player_id uuid references public.players (id) on delete cascade,
  /* Five digits, the poster's own. Null for a Flare posted to a board,
     which is located by its store instead. */
  add column if not exists posted_postal_code text;

alter table public.flares
  drop constraint if exists flares_postal_code_shape;

alter table public.flares
  add constraint flares_postal_code_shape
    check (posted_postal_code is null or posted_postal_code ~ '^[0-9]{5}$');

/*
 * Exactly one of the two shapes, never a mixture and never neither.
 *
 * Written as a whole-row check rather than four nullable columns and a
 * hope: a Flare with an event AND a postal code would be counted twice by
 * Local, and a Flare with neither is a row nobody can find, answer or
 * delete.
 */
alter table public.flares
  drop constraint if exists flares_belongs_to_a_board_or_an_area;

alter table public.flares
  add constraint flares_belongs_to_a_board_or_an_area
    check (
      (
        event_id is not null
        and player_session_id is not null
        and player_id is null
        and posted_postal_code is null
      )
      or (
        event_id is null
        and player_session_id is null
        and player_id is not null
        and posted_postal_code is not null
      )
    );

comment on column public.flares.player_id is
  'The account behind an area Flare. Null for a Flare posted to a room''s board, where the session carries the identity.';
comment on column public.flares.posted_postal_code is
  'The poster''s own five-digit ZIP, for an area Flare. Resolved to a centroid at read time; never a precise position.';

/* -------------------------------------------------------------------------- */
/* 2. Reading them                                                            */
/* -------------------------------------------------------------------------- */

/*
 * Local's own query: the open area Flares, newest first.
 *
 * There is no coordinate to index here — a ZIP becomes a point in the
 * application, from the bundled ZCTA table, because a geocoder is a third
 * party seeing a location and the founder has not approved one. So the
 * index carries the postal code and the radius filter happens after it.
 */
create index if not exists flares_area_open_idx
  on public.flares (posted_postal_code, status, created_at desc)
  where event_id is null;

/** Somebody's own area Flares, for the list they manage. */
create index if not exists flares_area_player_idx
  on public.flares (player_id, status)
  where event_id is null;

/*
 * One open area Flare per card per person.
 *
 * The board's equivalent index has always been keyed on the event, so an
 * area Flare fell outside it and the same card could be posted twice from
 * the same account. Partial, because a cancelled Flare should not block
 * posting the card again next month.
 */
create unique index if not exists flares_area_unique_idx
  on public.flares (player_id, card_id, printing_id, intent)
  where event_id is null and status = 'open';

commit;
