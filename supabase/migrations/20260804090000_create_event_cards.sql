-- Flares and Have Lists.
--
-- A Flare is a live request for a card. A Have entry is a card a player has
-- with them. They are the same shape — a player, a room, a card, how many, a
-- note — so they share a table and are told apart by `kind`. Matching in
-- Milestone 7 is then a self-join rather than a join across two tables that
-- would have to be kept identical anyway.
--
-- `printing_id` is nullable, and that is the point of it. Null means "any
-- printing will do", which is what most people mean when they need OP12-034.
-- A player who specifically wants the alternate art names the printing, and
-- matching can honour the difference instead of guessing.

create type public.event_card_kind as enum ('flare', 'have');
create type public.event_card_status as enum ('open', 'cancelled');

create table public.event_cards (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  event_id uuid not null references public.events (id) on delete cascade,
  player_session_id uuid not null
    references public.player_sessions (id) on delete cascade,

  kind public.event_card_kind not null,
  status public.event_card_status not null default 'open',

  card_id uuid not null references public.cards (id) on delete cascade,
  /*
   * Null means any printing.
   *
   * Cascade rather than `set null`, which was the first attempt and can make
   * an unrelated delete fail: a player holding both "any printing" and "the
   * alternate art" of one card has two rows, and nulling the second collides
   * with the first, so deleting the printing errors out. A Flare naming a
   * printing that no longer exists has lost its meaning anyway — losing the
   * stale row beats blocking the delete.
   */
  printing_id uuid references public.card_printings (id) on delete cascade,

  quantity smallint not null default 1,
  note text,

  constraint event_cards_quantity_sane check (quantity between 1 and 99),
  constraint event_cards_note_bounded check (note is null or char_length(note) <= 140)
);

comment on table public.event_cards is
  'Flares (cards a player needs) and Have List entries (cards a player has), in one Event Room. printing_id null means any printing.';
comment on column public.event_cards.printing_id is
  'A specific printing, or null for "any printing will do" — which is what most requests mean.';

/*
 * One row per player, card, printing and kind.
 *
 * Adding the same card twice is a quantity change, not a second Flare. The
 * unique index is what the application upserts against.
 *
 * Two indexes rather than one because Postgres treats nulls as distinct in a
 * unique index, so a null printing_id would let the same card be added
 * repeatedly. `nulls not distinct` says what is actually meant.
 */
create unique index event_cards_unique_idx
  on public.event_cards (event_id, player_session_id, kind, card_id, printing_id)
  nulls not distinct;

-- The room's Flare board: open flares for one event, newest first.
create index event_cards_board_idx
  on public.event_cards (event_id, kind, status, created_at desc);

-- A player's own lists, and the read-time cross-reference against them.
create index event_cards_owner_idx
  on public.event_cards (event_id, player_session_id, kind, status);

-- Matching in Milestone 7 joins a room's flares to its haves on the card.
create index event_cards_card_idx
  on public.event_cards (event_id, card_id, kind, status);

-- Deleting a session or a card should not have to scan every room.
create index event_cards_session_idx on public.event_cards (player_session_id);
create index event_cards_card_fk_idx on public.event_cards (card_id);
create index event_cards_printing_fk_idx on public.event_cards (printing_id);

alter table public.event_cards enable row level security;

/*
 * No policies, for the same reason as event_participants.
 *
 * A guest has no auth.uid() to key a policy off — that is what a guest session
 * is. Authorisation is possession of the session cookie, checked server-side.
 * A policy here would expose every player's Have List to anyone holding the
 * public anon key, and a Have List is a list of valuable objects a named
 * person is carrying in a room full of strangers.
 */
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on public.event_cards from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on public.event_cards from authenticated;
  end if;
end
$$;
