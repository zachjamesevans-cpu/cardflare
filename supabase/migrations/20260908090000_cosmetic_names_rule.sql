-- The naming rule, applied to the catalogue I wrote badly.
--
-- The founder's instruction was a rule, not a one-off: "I want that to
-- apply to all future cosmetics that get added as well." The very
-- catalogue seeded one migration ago broke it thirteen times - every
-- name style ended in "Name", under a heading that already reads Name
-- styles, which is the exact "extra word after every single cosmetic"
-- he had just asked to be rid of.
--
-- Kept honest from here by src/lib/players/cosmetic-names.ts and the
-- test that walks every seeded name in these migrations, so the next
-- batch cannot ship with the same fault.

begin;

update public.cosmetics set name = 'Ember' where slug = 'name-ember-name';
update public.cosmetics set name = 'Lime' where slug = 'name-lime-name';
update public.cosmetics set name = 'Frost' where slug = 'name-frost-name';
update public.cosmetics set name = 'Rose' where slug = 'name-rose-name';
update public.cosmetics set name = 'Gradient' where slug = 'name-gradient-name';
update public.cosmetics set name = 'Holographic' where slug = 'name-holographic-name';
update public.cosmetics set name = 'Gold' where slug = 'name-gold-name';
update public.cosmetics set name = 'Shimmer' where slug = 'name-shimmer-name';
update public.cosmetics set name = 'Glitch' where slug = 'name-glitch-name';
update public.cosmetics set name = 'Flame' where slug = 'name-flame-name';
update public.cosmetics set name = 'Ice' where slug = 'name-ice-name';

commit;
