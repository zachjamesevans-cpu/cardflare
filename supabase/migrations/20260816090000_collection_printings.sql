-- The collection learns printings.
--
-- Found by the first pilot player: their Collectr export said
-- "Perona (Alternate Art)" and the Flare on the board asked for exactly
-- that printing, but the collection stored only card numbers — so the
-- match honestly downgraded to "another printing" of a card that was in
-- fact the right one.
--
-- The import can resolve a printing only when Collectr's product name and
-- the catalog's own printing name agree exactly (no inference from name
-- suffixes — that rule is unchanged). A row whose printing cannot be
-- resolved keeps printing_id null, which the matcher already treats as
-- "have the card, printing unproven".

begin;

alter table public.player_collection
  add column printing_id uuid references public.card_printings (id) on delete cascade;

-- One row per exact ask, now per printing: the same card can appear as a
-- resolved alternate art, a resolved base, and an unresolved remainder.
alter table public.player_collection
  drop constraint player_collection_one_per_card;

alter table public.player_collection
  add constraint player_collection_one_per_printing
  unique nulls not distinct (player_id, card_id, printing_id);

commit;
