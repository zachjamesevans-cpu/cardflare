-- Profile cover images: the banner behind a player's picture.
--
-- One nullable column, the same shape avatar_url takes: a bare object
-- path inside the avatars bucket (covers/<playerId>/<stamp>.jpg),
-- written only by the server after sharp re-encodes the upload. RLS on
-- players is untouched: the column rides the existing policies, and
-- like the picture it is world-readable by design once served.

alter table public.players
  add column if not exists cover_image text;

-- Membership tiers: free, pro, ultra, max.
--
-- Foundation only. The column is the whole feature for now: the admin
-- console can move a player between tiers, and capability checks in
-- src/lib/tiers decide what each tier may do as those features ship
-- (animated GIF profile pictures are the first planned pro-and-up
-- perk). No billing is attached to this column yet.

alter table public.players
  add column if not exists tier text not null default 'free';

alter table public.players
  drop constraint if exists players_tier_check;

alter table public.players
  add constraint players_tier_check
  check (tier in ('free', 'pro', 'ultra', 'max'));
