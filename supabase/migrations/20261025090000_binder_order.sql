-- The binder's order is the owner's.
--
-- The founder, on the first binder: "I think we should have a 'hold to
-- move' thing, similar animations to how people can adjust which order
-- their flares are in when they post." So a Have list row gains the
-- pocket its owner dragged it to. Null until the owner arranges the
-- binder, and a null sorts FIRST, so a card just added lands in pocket
-- one and everything already placed keeps its place.

begin;

alter table public.player_cards
  add column if not exists position integer;

comment on column public.player_cards.position is
  'The binder pocket the owner put this card in, from 0. Null = not placed yet, shown first.';

commit;
