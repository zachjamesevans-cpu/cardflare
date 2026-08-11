-- The doorbell: "the board for Friday's locals is open."
--
-- Until now every notification was a reaction to a person doing
-- something — an offer, a trade, the first early Flares. This one is a
-- reaction to a clock: the moment a scheduled event's board opens (the
-- store's early window, or midnight of event day, whichever comes
-- first), players who saved the store as a local get told, so the board
-- fills before anyone is in the building. The backbone already knows
-- how to record, dedupe and deliver; all it lacked was permission to
-- store the kind.

begin;

alter table public.notifications
  drop constraint notifications_kind_check;

alter table public.notifications
  add constraint notifications_kind_check
    check (kind in ('offer-received', 'trade-confirmed', 'early-board', 'board-open'));

commit;
