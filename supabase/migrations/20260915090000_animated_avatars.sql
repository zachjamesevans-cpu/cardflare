-- Animated avatars: one column, because everything else already exists.
--
-- The founder: "make your avatar a GIF file, that will be viewable in
-- the room and the profile. this will be a pro and up only feature."
--
-- The gate needed nothing new. src/lib/tiers already declares
-- `animatedAvatar: true` in Pro's manifest, the ladder already gives it
-- to Ultra and Max, and the console already places a player on a tier.
-- That module's own note called this feature out by name as the one it
-- was waiting for: "the first real one (animated GIF profile pictures
-- for pro and up) ships when the upload pipeline grows a GIF path".
--
-- So all the database needs is somewhere to put the animation.
--
-- Two columns, not one. avatar_url keeps holding the still JPEG it
-- always has, and avatar_animated holds the GIF beside it. Every
-- animated upload writes BOTH, because the still is what somebody
-- dropped off Pro falls back to, what a client that cannot animate
-- shows, and what stops a profile picture from vanishing the day a
-- tier changes. A picture that disappears is a worse failure than one
-- that stopped moving.

begin;

alter table public.players
  add column if not exists avatar_animated text;

comment on column public.players.avatar_animated is
  'Storage object for an animated GIF avatar, shown only while the player is pro or above. avatar_url keeps the still poster beside it.';

commit;
