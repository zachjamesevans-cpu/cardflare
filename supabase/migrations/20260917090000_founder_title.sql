-- The Founder title, glowing.
--
-- The founder: "please add a glowing 'founder' tag for the titles
-- section so I can add it to myself."
--
-- A draft like every other cosmetic, so it appears in his own
-- Customize and nowhere near the Embers store until he says so. It is
-- deliberately not purchasable: cost_embers is 0 and nothing puts it
-- in a pack, so the only way to wear it is a grant.
--
-- The name is "Founder" and not "Founder Title": the heading over it
-- already says Titles, and the naming rule has been given twice.

begin;

insert into public.cosmetics
  (slug, kind, name, description, cost_embers, requires_earned, sort_order, status)
values
  ('title-founder', 'title', 'Founder',
   'The one who started CardFlare.', 0, null, 5, 'draft')
on conflict (slug) do nothing;

commit;
