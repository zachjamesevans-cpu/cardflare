-- The indexes the launch-day reads were missing.
--
-- Every index on `flares` led with `event_id`, which is right for a
-- room's board and useless for the Feed, whose two newest queries read
-- across every room at once: "open Flares from the last week, newest
-- first" and "open wants for these cards". Both were sequential scans
-- that would have started to hurt at a few tens of thousands of rows.
-- The other three are foreign keys read without an index: a session
-- being deleted checks its Flares, a store's locals are read to ring
-- its board-open doorbell, and the open-rooms list filters events by
-- status and start.

begin;

create index if not exists flares_open_recent_idx
  on public.flares (created_at desc)
  where status = 'open';

create index if not exists flares_open_want_card_idx
  on public.flares (card_id, created_at desc)
  where status = 'open' and intent = 'want';

create index if not exists flares_session_idx
  on public.flares (player_session_id);

create index if not exists player_locals_store_idx
  on public.player_locals (store_id);

create index if not exists events_status_starts_at_idx
  on public.events (status, starts_at);

commit;
