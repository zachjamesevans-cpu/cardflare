-- Five more borders for the Embers store.
--
-- The founder's ask, after the first picture landed: more frames to wear
-- around it. The catalogue is data, so new borders are rows; the classes
-- that draw them ship in the same change (globals.css, player-avatar.tsx,
-- cosmetic-card.tsx, and the app's colour maps).
--
-- The ladder deliberately spans the whole economy. Two are a night or
-- two of trading, one is a real save, and the top two are gated on
-- lifetime EARNED Embers so they stay something you visibly traded for.
-- An admin grant of spendable Embers cannot reach them; unlock-all can,
-- which is what unlock-all means.
--
-- `on conflict do nothing` so re-running the file is safe, same as the
-- original catalogue seed.
--
-- Sort orders interleave with the existing rows (10, 20, 30) rather than
-- appending after them, so the shelf reads cheap to expensive instead of
-- old to new. That ordering is the shop's whole pitch: the eye walks up
-- the ladder and lands on the thing worth trading for.

insert into public.cosmetics (slug, kind, name, description, cost_embers, requires_earned, sort_order)
values
  ('frost-edge',  'frame', 'Frost Edge',  'A cool blue ring.',                      150, null, 11),
  ('rose-edge',   'frame', 'Rose Edge',   'Pink around the picture.',               250, null, 12),
  ('gilded-edge', 'frame', 'Gilded Edge', 'Gold trim, worn quietly.',               500, null, 21),
  ('molten-edge', 'frame', 'Molten Edge', 'Ember colours that never stop moving.',  800,  300, 31),
  ('galaxy-edge', 'frame', 'Galaxy Edge', 'Deep space, wrapped around you.',       1200,  500, 32)
on conflict (slug) do nothing;
