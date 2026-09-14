-- Nearby matching: a quiet answer to "who near me has this".
--
-- The founder's brief: "a very lightweight version of local matching
-- without bringing back the old Local tab or marketplace-style
-- browsing." Cards on a private Have list can be marked available to
-- trade locally; a player's saved Flares are matched, quietly, against
-- the cards people near them have marked; and a match is shown ONLY to
-- the two people in it, through the Feed, a notification and a thread.
-- Nobody can browse anybody's list, and nothing here is a listing, a
-- price, a checkout or a shipment.
--
-- Four small changes and no new table, because every piece already
-- exists: the Have list is `player_cards`, the Flares are
-- `player_wants`, distance is the ZIP centroid Local already uses, the
-- conversation is `flare_threads`, and the notice is `notifications`
-- with its dedupe key. The Feed's card is computed at read time the way
-- "players want a card you're holding" already is.
--
-- THE HOLDER IS THE ONE TOLD. The room's rule since Milestone 6: a
-- binder is never broadcast; the holder learns privately that they can
-- help and chooses to be found. Nearby keeps that exactly. The wanter
-- hears nothing until the holder taps "I have this", which opens the
-- thread and sends the first message.
begin;

/* -------------------------------------------------------------------------- */
/* 1. A card on the Have list that may be traded locally                      */
/* -------------------------------------------------------------------------- */

alter table public.player_cards
  add column if not exists local_trade boolean not null default false;

comment on column public.player_cards.local_trade is
  'The owner will trade this card with people nearby. Off by default; the rest of the list stays private to rooms.';

/* Matching reads "who nearby has THIS card and will trade it", so the
   index is by card and only over the rows that said yes. */
create index if not exists player_cards_local_trade_idx
  on public.player_cards (card_id)
  where local_trade;

/* -------------------------------------------------------------------------- */
/* 2. The opt-in                                                              */
/* -------------------------------------------------------------------------- */

alter table public.players
  add column if not exists nearby_matching boolean not null default false;

comment on column public.players.nearby_matching is
  'Match this player''s Flares with cards people nearby will trade, and their marked cards with Flares nearby. Off means neither direction.';

/* -------------------------------------------------------------------------- */
/* 3. A conversation about a saved Flare, not only a posted one               */
/* -------------------------------------------------------------------------- */

/*
 * A nearby match is between a WANT (a saved Flare on the player's own
 * list) and a card. Nothing is posted to any board, so there is no
 * `flares` row for the thread to hang off. The thread gains a second
 * anchor and the rule that it has exactly one.
 */
alter table public.flare_threads
  alter column flare_id drop not null;

alter table public.flare_threads
  add column if not exists want_id uuid references public.player_wants (id) on delete cascade;

alter table public.flare_threads
  drop constraint if exists flare_threads_one_anchor;

alter table public.flare_threads
  add constraint flare_threads_one_anchor
    check ((flare_id is null) <> (want_id is null));

comment on column public.flare_threads.want_id is
  'The saved Flare a nearby-match thread is about. Set instead of flare_id; a thread has exactly one of the two.';

/* Answering the same want twice is the same conversation, as with a Flare. */
create unique index if not exists flare_threads_want_unique_idx
  on public.flare_threads (want_id, responder_player_id)
  where want_id is not null;

/* -------------------------------------------------------------------------- */
/* 4. The notice                                                              */
/* -------------------------------------------------------------------------- */

alter table public.notifications
  drop constraint if exists notifications_kind_check;

alter table public.notifications
  add constraint notifications_kind_check
    check (kind in (
      'offer-received',
      'trade-confirmed',
      'early-board',
      'board-open',
      'new-follower',
      'room-flare',
      'message-received',
      'nearby-match'
    ));

commit;
