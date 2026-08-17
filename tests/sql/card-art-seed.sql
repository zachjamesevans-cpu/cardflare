-- A printing carrying a provider URL, seeded before the card-art
-- migration so the loosened check has real rows to survive.
--
-- Run by scripts/probe-migrations.sh.

begin;

insert into public.cards
  (id, canonical_card_number, compact_card_number, exact_name, normalized_name,
   provider_key)
values
  ('33333333-3333-3333-3333-333333333331', 'OP01-025', 'OP01025',
   'Roronoa Zoro', 'roronoa zoro', 'optcgapi'),
  ('33333333-3333-3333-3333-333333333332', 'OP17-001', 'OP17001',
   'Spoiler Leader', 'spoiler leader', 'kaizoku');

insert into public.card_printings
  (id, card_id, provider_key, provider_external_id, set_code, image_url)
values
  -- The arrangement that exists today: a provider's own https URL.
  ('44444444-4444-4444-4444-444444444441',
   '33333333-3333-3333-3333-333333333331', 'optcgapi', 'OP01-025-1',
   'OP01', 'https://optcgapi.com/images/OP01-025.png'),
  -- A printing with no art at all, which stays legal.
  ('44444444-4444-4444-4444-444444444442',
   '33333333-3333-3333-3333-333333333332', 'kaizoku', 'OP17-001-1',
   'OP17', null);

commit;
