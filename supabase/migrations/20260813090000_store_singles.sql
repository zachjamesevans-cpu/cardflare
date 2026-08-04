-- Store singles: a game store's counter inventory, synced from their own
-- TCGplayer Pro export so a Flare in their room can say "the counter may
-- have this" — turning the board into a sales channel instead of a rival.
--
-- Two deliberate shapes:
--   * Rows are aggregated per card, never per listing. The export lists one
--     row per condition and printing; the room only needs "the store has
--     this card", so quantities collapse to one row per (store, card) and
--     the row count stays bounded by the catalog, not the store's shelf.
--   * No price column exists, so no price can ever be stored. The export
--     carries prices; they are dropped at parse time and have nowhere to
--     land here even by mistake. PRODUCT.md: CardFlare shows no prices.

begin;

/* -------------------------------------------------------------------------- */
/* 1. The synced counter stock, one row per card                              */
/* -------------------------------------------------------------------------- */

create table public.store_singles (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  store_id uuid not null references public.stores (id) on delete cascade,
  card_id uuid not null references public.cards (id) on delete cascade,
  quantity integer not null check (quantity > 0),

  -- A sync replaces the whole set, so each card appears once per store.
  constraint store_singles_one_per_card unique (store_id, card_id)
);

comment on table public.store_singles is
  'A store''s synced counter singles, aggregated per card. No prices, ever.';

-- The room asks "which of these cards does this store have" — store first,
-- then card, is exactly that lookup.
create index store_singles_store_card_idx
  on public.store_singles (store_id, card_id);

/* -------------------------------------------------------------------------- */
/* 2. One sync record per store: the stat card, and the honesty line          */
/* -------------------------------------------------------------------------- */

create table public.store_singles_syncs (
  store_id uuid primary key references public.stores (id) on delete cascade,
  synced_at timestamptz not null default now(),
  -- What the file contained vs what the catalog recognised, so the store
  -- sees "37 lines we could not match" rather than a silently smaller number.
  lines_seen integer not null check (lines_seen >= 0),
  cards_matched integer not null check (cards_matched >= 0),
  lines_unmatched integer not null check (lines_unmatched >= 0)
);

comment on table public.store_singles_syncs is
  'Latest singles sync per store: when, and how much of the file matched.';

/* -------------------------------------------------------------------------- */
/* 3. Same security stance as every table before them                         */
/* -------------------------------------------------------------------------- */

alter table public.store_singles enable row level security;
alter table public.store_singles_syncs enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['store_singles', 'store_singles_syncs'] loop
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('revoke all on public.%I from anon', t);
    end if;
    if exists (select 1 from pg_roles where rolname = 'authenticated') then
      execute format('revoke all on public.%I from authenticated', t);
    end if;
  end loop;
end $$;

commit;
