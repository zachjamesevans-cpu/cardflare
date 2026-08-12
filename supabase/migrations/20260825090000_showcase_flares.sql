-- Showcases: a Flare pointed the other way.
--
-- Until now every Flare meant "I need this". A showcase means "I have
-- this and I would let it go" — the founder's case: a rare card you
-- want to move without working the room card by card.
--
-- Deliberately the SAME table rather than a new one. A showcase must be
-- public, grouped under whoever posted it, tappable, quantity-bearing,
-- removable and answerable exactly like a Flare; every one of those
-- behaviours already exists on `flares`, and a parallel table would be
-- a second copy of all of it, drifting. One column says which way the
-- card is pointing, and the whole board inherits the rest.
--
-- `intent` rather than reusing the old `kind` name: `kind` existed here
-- once for the Flare/Have split, was dropped when Have lists became
-- `player_cards`, and reviving the word for a different distinction
-- would make the history lie.

begin;

alter table public.flares
  add column intent text not null default 'want'
    check (intent in ('want', 'showcase'));

comment on column public.flares.intent is
  'want = the poster needs this card; showcase = the poster has it and will let it go.';

/*
 * The uniqueness rule gains the intent.
 *
 * Without it, showcasing a card you already have an open Flare for
 * collides — and those are two coherent, opposite statements about the
 * same card (rare, but a player clearing a playset while hunting the
 * alternate art is real). With it, each direction gets one row and a
 * duplicate showcase is still refused.
 */
drop index if exists public.flares_unique_idx;

create unique index flares_unique_idx
  on public.flares (event_id, player_session_id, card_id, printing_id, intent)
  nulls not distinct;

/*
 * The matcher's index. Finding "who in this room is hunting the card I
 * just showcased" is the query that makes the feature work, and it runs
 * on every showcase post.
 */
create index flares_intent_idx on public.flares (event_id, intent, status, card_id);

commit;
