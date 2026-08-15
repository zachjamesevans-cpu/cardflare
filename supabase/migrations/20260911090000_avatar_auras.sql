-- Avatar effects ("aura"): the animated things that float around a
-- profile picture, split out of profile borders.
--
-- The founder's correction, near verbatim: "Animated profile things
-- such as Sakura or otherwise should be separate from profile borders.
-- Because they're not borders. You should be able to mix and match."
-- So a border is a band and nothing else, an aura is the animation and
-- nothing else, and a player wears one of each.

begin;

-- 1. The new kind, in both check constraints ---------------------------

alter table public.cosmetics
  drop constraint cosmetics_kind_check;

alter table public.cosmetics
  add constraint cosmetics_kind_check
    check (kind in (
      -- shipped and live
      'frame', 'holo', 'effect',
      -- the catalog
      'ring', 'aura', 'border', 'pattern', 'animation',
      'background', 'scene', 'nameplate', 'title', 'badge'
    ));

alter table public.player_equips
  drop constraint player_equips_kind_check;

alter table public.player_equips
  add constraint player_equips_kind_check
    check (kind in (
      'ring', 'aura', 'border', 'pattern', 'animation', 'background',
      'scene', 'nameplate', 'title', 'badge'
    ));

-- 2. The auras ----------------------------------------------------------

insert into public.cosmetics
  (slug, kind, name, description, cost_embers, requires_earned, sort_order, status)
values
  ('aura-hearts', 'aura', 'Hearts', 'Small hearts floating up around your picture.', 0, null, 10, 'draft'),
  ('aura-sakura', 'aura', 'Sakura', 'Petals drifting around your picture.', 0, null, 20, 'draft'),
  ('aura-sparks', 'aura', 'Sparks', 'Tiny sparks rising.', 0, null, 30, 'draft'),
  ('aura-stars', 'aura', 'Stars', 'Stars in slow orbit.', 0, null, 40, 'draft'),
  ('aura-snow', 'aura', 'Snow', 'Flakes falling, quiet and slow.', 0, null, 50, 'draft'),
  ('aura-bubbles', 'aura', 'Bubbles', 'Bubbles wobbling upward.', 0, null, 60, 'draft'),
  ('aura-static', 'aura', 'Static', 'Little arcs jumping now and then.', 0, null, 70, 'draft'),
  ('aura-holo-shards', 'aura', 'Holo Shards', 'Shards of foil catching the light.', 0, null, 80, 'draft')
on conflict (slug) do nothing;

-- 3. The borders that were secretly animations --------------------------
-- Their floating particles now live in the auras above; the bands stay
-- and their descriptions stop promising motion the band no longer has.

update public.cosmetics set description = 'A warm pink band.'
  where slug = 'ring-heart';
update public.cosmetics set description = 'Petal pink, soft and quiet.'
  where slug = 'ring-sakura';
update public.cosmetics set description = 'Ember orange, faintly glowing.'
  where slug = 'ring-ember';
update public.cosmetics set description = 'Deep night blue with a starlit sheen.'
  where slug = 'ring-starfield';

commit;
