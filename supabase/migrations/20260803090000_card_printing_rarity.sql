-- Rarity belongs to the printing, not to the card.
--
-- OP12-034 Perona exists as a base art and an alternate art. Both are the same
-- card in play — one gameplay identity, one card number — but they are printed
-- at different rarities and are traded as different things. Rarity was stored
-- only on `cards`, and `mergeByCardNumber` keeps the first record's value, so
-- whichever printing the provider happened to return first silently decided
-- the rarity for every printing of that card and the other one's was lost.
--
-- The column on `cards` stays. It is the rarity of the card as most people
-- mean it, it is what search already ranks and filters on, and removing it
-- would break both for no gain. This adds the per-printing value alongside it.
--
-- Additive and safe to re-run. Existing rows get null until the next sync,
-- which is correct: nobody has told us what those printings' rarities are.

alter table public.card_printings
  add column if not exists rarity text;

comment on column public.card_printings.rarity is
  'Rarity of this specific printing. Null until a sync has supplied it. The '
  'same card number can be printed at more than one rarity — a base art and an '
  'alternate art — and public.cards.rarity can only hold one of them.';

-- Supports listing every printing of a card, which is what the search result
-- now renders. The card_id index already exists; this one keeps the rarity
-- available to an index-only scan rather than sending it to the heap.
create index if not exists card_printings_card_id_rarity_idx
  on public.card_printings (card_id, rarity);
