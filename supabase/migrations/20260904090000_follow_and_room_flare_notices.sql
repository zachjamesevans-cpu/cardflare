-- Two more reasons a phone should light up.
--
-- Until now the backbone only spoke when something happened TO a card
-- you had posted, or when a board opened at a store you saved. Two
-- everyday moments were silent:
--
--   new-follower  Somebody followed you. The social half of the product
--                 shipped without ever telling anyone it happened.
--   room-flare    Somebody posted a Flare in a room you are standing in.
--                 The board updates; nobody looks at a phone in a pocket.
--
-- Recording, deduping and delivery are unchanged - the kind check was
-- the only thing standing between these events and the existing rails.

begin;

alter table public.notifications
  drop constraint notifications_kind_check;

alter table public.notifications
  add constraint notifications_kind_check
    check (kind in (
      'offer-received',
      'trade-confirmed',
      'early-board',
      'board-open',
      'new-follower',
      'room-flare'
    ));

commit;
