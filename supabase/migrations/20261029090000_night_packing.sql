-- What to bring: the Packed tick on a night's checklist.
--
-- The founder (2026-10-03): "WHAT TO BRING. Helps users prepare before
-- leaving. If attendees are hunting cards in the user's Trade Binder,
-- show those cards... Allow marking cards 'Packed'. A simple
-- checklist."
--
-- The checklist itself is computed at read time from the Have list and
-- the roster's wants, so nothing about WHICH cards to bring is stored.
-- The one fact a player adds is the tick, and this is it: a row means
-- packed, no row means not yet. Keyed on the night, the player and the
-- card, so a tick cannot be made twice and leaves with the night, the
-- player or the card. The founder's possible reminder ("4 players at
-- tonight's Night are looking for cards in your binder") would read
-- the same derived list and needs nothing more here.
--
-- Service role only, like every table a player session writes: RLS is
-- on with no policies, and the server proves who is asking.
begin;

create table if not exists public.night_packing (
  event_id uuid not null references public.events(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  card_id uuid not null references public.cards(id) on delete cascade,
  packed_at timestamptz not null default now(),
  primary key (event_id, player_id, card_id)
);

comment on table public.night_packing is
  'A Packed tick on a card of a player''s What to bring list at one night. Row = packed.';

alter table public.night_packing enable row level security;

commit;
