-- Offers grow a quantity, and lose the held-card gate (a code change,
-- recorded here for the archaeology).
--
-- The founder's example is the spec again: Damian wants 2x Brook and
-- Chunc has one. Chunc's pledge should say "bringing 1", and the room
-- should read "still needs 1 more" instead of "someone's got it". And
-- the pledge no longer requires the card to be in tonight's binder or
-- a synced collection - plenty of players know what's in their box at
-- home without having typed it in. The offer cap still guards against
-- a name on every Flare.

begin;

alter table public.flare_responses
  add column quantity integer not null default 1
    check (quantity between 1 and 99);

comment on column public.flare_responses.quantity is
  'How many copies the responder says they can bring. Defaults to one.';

commit;
