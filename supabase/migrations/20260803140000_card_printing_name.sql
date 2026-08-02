-- The provider's name for a specific printing.
--
-- Found by the admin spot check. EB01-001 has three printings and two of them
-- rendered as the identical chip, "EB-01 · L", because they share a set code
-- and a rarity. What actually separates them is the name: the provider returns
-- "Kouzuki Oden" for the base printing and "Kouzuki Oden (SPR)" for the
-- alternate art. Rarity was the right idea and is not enough on its own.
--
-- The same discovery explains a second, more visible fault. `cards.exact_name`
-- is set by whichever record merged first, so the card was displaying as
-- "Kouzuki Oden (SPR)" — a variant's name standing in for the card's. Storing
-- the per-printing name is what lets the card keep the base name while each
-- printing still says which one it is.
--
-- Additive and safe to re-run. Existing rows get null until the next sync.

alter table public.card_printings
  add column if not exists printing_name text;

comment on column public.card_printings.printing_name is
  'The provider''s name for this specific printing, verbatim. Differs from '
  'public.cards.exact_name when the provider marks a variant in the name, e.g. '
  '"Kouzuki Oden (SPR)" against "Kouzuki Oden". Null until a sync supplies it.';
