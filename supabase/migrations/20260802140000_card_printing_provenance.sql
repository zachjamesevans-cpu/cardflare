-- Records where a printing came from, and the provider's own image id.
--
-- Both emerged from reading the provider's documentation: it names
-- `card_image_id` as a per-artwork identifier, and it exposes cards through
-- four separate endpoint groups. Storing them is what lets the printing key be
-- source + card number + image id, which keeps an alternate art as its own
-- printing instead of merging it into the base card.
--
-- Additive and safe to re-run.

alter table public.card_printings
  add column if not exists image_id text,
  add column if not exists provider_source text;

comment on column public.card_printings.image_id is
  'The provider''s own per-artwork identifier. Part of the printing key when present.';
comment on column public.card_printings.provider_source is
  'Which endpoint group produced the record: set, starter-deck, promo or don.';

create index if not exists card_printings_source_idx
  on public.card_printings (provider_source);

create index if not exists card_printings_image_id_idx
  on public.card_printings (image_id);
