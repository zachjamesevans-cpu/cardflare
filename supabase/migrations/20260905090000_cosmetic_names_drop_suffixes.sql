-- Cosmetics say the colour, not the category.
--
-- The founder's note: "no need to have 'edge' after getting. Just list
-- the colour name... You explain what a card edge is, but then have
-- 'edge' after every colour. That isn't necessary. Same thing with
-- galaxy holos and all the holo."
--
-- He is right. The store already groups these under headings that say
-- what they are, so "Prism Edge" under a section headed Card edges reads
-- as "Prism Edge Edge". Eight frames and three holos lose the suffix.
--
-- Slugs are UNTOUCHED on purpose: they are what pack pools, equipped
-- columns and every player's owned rows point at. Renaming a slug would
-- silently unequip cosmetics people paid for. Only the display name,
-- which nothing joins on, changes here.
--
-- Names collide ACROSS kinds now (Prism is both a frame and a holo) and
-- that is correct - they are never listed together, and a section
-- heading is what tells them apart. Uniqueness is per kind, which the
-- unique index on (kind, name) below keeps honest.

begin;

update public.cosmetics set name = 'Ember'   where slug = 'ember-edge';
update public.cosmetics set name = 'Frost'   where slug = 'frost-edge';
update public.cosmetics set name = 'Rose'    where slug = 'rose-edge';
update public.cosmetics set name = 'Lime'    where slug = 'lime-edge';
update public.cosmetics set name = 'Gilded'  where slug = 'gilded-edge';
update public.cosmetics set name = 'Prism'   where slug = 'prism-edge';
update public.cosmetics set name = 'Molten'  where slug = 'molten-edge';
update public.cosmetics set name = 'Galaxy'  where slug = 'galaxy-edge';

update public.cosmetics set name = 'Classic' where slug = 'classic-holo';
update public.cosmetics set name = 'Prism'   where slug = 'prism-holo';
update public.cosmetics set name = 'Galaxy'  where slug = 'galaxy-holo';

-- Two cosmetics of the SAME kind sharing a name would be unpickable in
-- a list that shows only the name. Enforced from here on.
create unique index if not exists cosmetics_kind_name_key
  on public.cosmetics (kind, name);

commit;
