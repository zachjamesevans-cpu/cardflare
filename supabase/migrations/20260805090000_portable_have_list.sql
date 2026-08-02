-- A Have List belongs to a player, not to an event.
--
-- Scoping it to the event was right while nothing consumed it automatically: a
-- list that only ever describes one evening cannot go stale. It becomes wrong
-- the moment matching exists, because a player would have to retype their
-- binder at every event — including the same store's next Friday, which is a
-- different event row — and a matching engine with an empty list on both sides
-- matches nothing.
--
-- So Haves move to their own table keyed on the player session, which already
-- survives 30 days and renews on use. Flares stay on the event, because
-- wanting a card *tonight* is exactly what a Flare means.
--
-- The two are no longer the same shape, so they no longer share a table. What
-- is left of `event_cards` is Flares and only Flares, and it is renamed to say
-- so — PRODUCT.md asks for the product's vocabulary in the code.

begin;

/* -------------------------------------------------------------------------- */
/* 1. The portable Have List                                                  */
/* -------------------------------------------------------------------------- */

create table public.player_cards (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  player_session_id uuid not null
    references public.player_sessions (id) on delete cascade,

  card_id uuid not null references public.cards (id) on delete cascade,
  -- Null means any printing, as on a Flare.
  printing_id uuid references public.card_printings (id) on delete cascade,

  quantity smallint not null default 1,
  note text,

  /*
   * When the player last said they were still carrying this.
   *
   * The whole reason a portable list is safe. A stale list is worse than no
   * list: being told "Zach has this", walking over, and finding he traded it
   * last week costs more trust than never matching at all. One tap on arrival
   * turns "he has it" into "he said he had it an hour ago".
   */
  confirmed_at timestamptz not null default now(),

  constraint player_cards_quantity_sane check (quantity between 1 and 99),
  constraint player_cards_note_bounded
    check (note is null or char_length(note) <= 140)
);

comment on table public.player_cards is
  'A player''s trade binder. Follows the player across events and stores. Private: never shown to anyone but its owner.';
comment on column public.player_cards.confirmed_at is
  'When the player last confirmed they still have this. Freshness, not creation time.';

-- Adding the same card twice is a quantity change, not a second row. Nulls
-- must collide too, or "any printing" could be added repeatedly.
create unique index player_cards_unique_idx
  on public.player_cards (player_session_id, card_id, printing_id)
  nulls not distinct;

-- Reading one player's binder, and checking its freshness.
create index player_cards_owner_idx
  on public.player_cards (player_session_id, confirmed_at);

-- Matching joins a room's Flares to the binders of everyone present.
create index player_cards_card_idx on public.player_cards (card_id);
create index player_cards_printing_fk_idx on public.player_cards (printing_id);

alter table public.player_cards enable row level security;

/*
 * No policies, as with every other guest-owned table.
 *
 * A guest has no auth.uid() to key one off. This is the most sensitive table
 * in the schema — an inventory of valuable objects tied to a named person
 * across venues — so the anon key must not reach it under any circumstances.
 */
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on public.player_cards from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on public.player_cards from authenticated;
  end if;
end
$$;

/* -------------------------------------------------------------------------- */
/* 2. Carry existing Have entries over                                        */
/* -------------------------------------------------------------------------- */

/*
 * A player who listed the same card at two events collapses to one row. The
 * larger quantity wins: someone who said 2 at one event and 1 at another most
 * likely owns 2, and under-stating a binder loses matches while over-stating
 * one only costs a conversation.
 */
insert into public.player_cards
  (player_session_id, card_id, printing_id, quantity, note, created_at, confirmed_at)
select
  player_session_id,
  card_id,
  printing_id,
  max(quantity),
  min(note),
  min(created_at),
  max(updated_at)
from public.event_cards
where kind = 'have' and status = 'open'
group by player_session_id, card_id, printing_id
on conflict do nothing;

/* -------------------------------------------------------------------------- */
/* 3. What remains is Flares, and is named so                                 */
/* -------------------------------------------------------------------------- */

delete from public.event_cards where kind = 'have';

/*
 * Dropped explicitly, before the column they depend on.
 *
 * Postgres drops any index containing a dropped column, silently. Relying on
 * that and then renaming them afterwards fails with "relation does not exist",
 * which is how this was found. Saying it out loud costs nothing and the
 * migration then reads as what it does.
 */
drop index if exists public.event_cards_unique_idx;
drop index if exists public.event_cards_board_idx;
drop index if exists public.event_cards_owner_idx;
drop index if exists public.event_cards_card_idx;

alter table public.event_cards drop column kind;
drop type if exists public.event_card_kind;

alter table public.event_cards rename to flares;
alter type public.event_card_status rename to flare_status;

-- The surviving indexes and constraints keep their old names through a table
-- rename, which would leave every one of them lying about what it indexes.
alter index public.event_cards_pkey rename to flares_pkey;
alter index public.event_cards_session_idx rename to flares_session_idx;
alter index public.event_cards_card_fk_idx rename to flares_card_fk_idx;
alter index public.event_cards_printing_fk_idx rename to flares_printing_fk_idx;

alter table public.flares
  rename constraint event_cards_quantity_sane to flares_quantity_sane;
alter table public.flares
  rename constraint event_cards_note_bounded to flares_note_bounded;

comment on table public.flares is
  'A live request for a card, in one Event Room. Public to everyone in that room. printing_id null means any printing.';

-- Rebuilt without `kind`, which no longer distinguishes anything.
create unique index flares_unique_idx
  on public.flares (event_id, player_session_id, card_id, printing_id)
  nulls not distinct;

create index flares_board_idx
  on public.flares (event_id, status, created_at desc);

create index flares_owner_idx
  on public.flares (event_id, player_session_id, status);

-- Matching joins a room's Flares to the binders of everyone present.
create index flares_card_idx on public.flares (event_id, card_id, status);

commit;
