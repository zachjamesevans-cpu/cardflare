-- The early-board digest gets a seat in the notifications table.
--
-- "Wednesday's board is open and has Flares on it, and you own cards
-- those players are hunting" is the message that makes somebody throw
-- the binder in the car. The backbone already knows how to record,
-- dedupe and deliver; all it lacked was permission to store the kind.

begin;

alter table public.notifications
  drop constraint notifications_kind_check;

alter table public.notifications
  add constraint notifications_kind_check
    check (kind in ('offer-received', 'trade-confirmed', 'early-board'));

commit;
