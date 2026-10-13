-- Sakura Season: the first themed drop.
--
-- The founder, after the Embers review (2026-10-11): option b, then
-- "buildin 3-5 in same round". Step 3 is cosmetics released as sets,
-- the way the cards themselves are: six sakura cosmetics, reworked
-- (a notched blossom petal that falls and tumbles, two shades and two
-- tilts, a richer ring), switched on with prices and sold together as
-- their own pack.
--
-- Safe to run twice: every statement sets the same values again.

begin;

-- 1. The six, live and priced. Bought one at a time in the shop's
--    daily rotation, or pulled from the pack below. Wearing is Pro.
update public.cosmetics set status = 'live', cost_embers = 300
  where slug = 'bg-sakura-garden';
update public.cosmetics set status = 'live', cost_embers = 250
  where slug = 'ring-sakura';
update public.cosmetics set status = 'live', cost_embers = 300
  where slug = 'pattern-sakura-petals';
update public.cosmetics set status = 'live', cost_embers = 350
  where slug = 'anim-sakura-petals';
update public.cosmetics set status = 'live', cost_embers = 400,
  description = 'Blossom petals falling and tumbling around your picture.'
  where slug = 'aura-sakura';
update public.cosmetics set status = 'live', cost_embers = 500
  where slug = 'scene-sakura-petals';

-- 2. The pack: set 2, on sale from now. The shop sells a set only when
--    it is live, released, its weights reach 100 and every item is live
--    (src/lib/packs/catalog.ts), which this satisfies.
insert into public.pack_series
  (slug, name, set_number, description, price_embers, slots, release_at, status)
values
  ('sakura-season', 'Sakura Season', 2,
   'Six sakura cosmetics, one set. Blossom for your picture, your cards and your profile.',
   300, 3, now(), 'live')
on conflict (slug) do update set
  name = excluded.name,
  set_number = excluded.set_number,
  description = excluded.description,
  price_embers = excluded.price_embers,
  slots = excluded.slots,
  status = excluded.status;

insert into public.pack_series_items (series_slug, cosmetic_slug, rarity, weight)
values
  ('sakura-season', 'bg-sakura-garden', 'common', 30),
  ('sakura-season', 'ring-sakura', 'common', 25),
  ('sakura-season', 'pattern-sakura-petals', 'uncommon', 18),
  ('sakura-season', 'anim-sakura-petals', 'rare', 15),
  ('sakura-season', 'aura-sakura', 'epic', 8),
  ('sakura-season', 'scene-sakura-petals', 'legendary', 4)
on conflict (series_slug, cosmetic_slug) do update set
  rarity = excluded.rarity,
  weight = excluded.weight;

commit;
