-- Profile borders split from card borders, and cards dress themselves.
--
-- The founder's spec, in schema form:
--
--   * The border around a profile picture is its own choice, separate
--     from the border on showcase cards. New column, backfilled from the
--     old shared slot so nobody's picture undresses when this ships.
--   * Each showcase card can carry its own frame and holo. Null means
--     "wear the profile's default", which is what every existing card
--     does today, so the backfill is no backfill at all.
--
-- One catalogue, one purchase: owning Frost Edge covers wearing it
-- around your picture, on all cards, or on one card. The columns only
-- say where it is worn.
--
-- `on delete set null` on the per-card slugs: a cosmetic removed from
-- the catalogue leaves a plain card, never a broken row - the same
-- fall-through rule the renderers already follow.

alter table public.players
  add column if not exists equipped_avatar_frame text;

comment on column public.players.equipped_avatar_frame is
  'The frame worn around the profile picture, by slug. Separate from equipped_frame, which is the DEFAULT frame for showcase cards. Null means the free frame.';

update public.players
set equipped_avatar_frame = equipped_frame
where equipped_avatar_frame is null;

comment on column public.players.equipped_frame is
  'The DEFAULT frame for showcase cards, by slug. A player_showcase row with its own frame_slug overrides this for that card. The picture wears equipped_avatar_frame instead.';

alter table public.player_showcase
  add column if not exists frame_slug text references public.cosmetics (slug) on delete set null,
  add column if not exists holo_slug text references public.cosmetics (slug) on delete set null;

comment on column public.player_showcase.frame_slug is
  'This card''s own frame, or null to wear the profile''s default.';
comment on column public.player_showcase.holo_slug is
  'This card''s own holo pattern, or null to wear the profile''s default.';
