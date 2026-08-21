-- Where a player is, when they will not hand over a device location.
--
-- The founder, on the first cut of Nearby Flares anchoring itself on a
-- store the player had saved: "really it should be asking for location
-- permissions to find stores near them, or at the very least asking for
-- a zip code of their address. nothing to do with 'my store', because
-- most of this is customer/player facing."
--
-- So a player's position now comes from the player. A device coordinate
-- is asked for first and NEVER STORED - it rides one request and is gone
-- - and this column is the fallback for a refusal, for the website,
-- and for anybody who would simply rather type five digits.
--
-- FIVE DIGITS AND NOTHING FINER. A ZIP is coarse by construction: the
-- centroid CardFlare resolves it to is the middle of an area that can be
-- miles across, which is all "stores near you" needs and is a long way
-- from an address. Nothing here holds a street, and nothing here holds a
-- latitude.

alter table public.players
  add column if not exists postal_code text;

comment on column public.players.postal_code is
  'Five-digit US ZIP the player typed, used only to place them within a few miles for Nearby. Never a street address; device coordinates are never stored here.';

-- Null is the normal state - most players will never set one - so the
-- constraint has to admit it and reject everything that is not five
-- digits, including the "97477-1234" a browser autofill likes to send.
alter table public.players
  drop constraint if exists players_postal_code_shape;

alter table public.players
  add constraint players_postal_code_shape
  check (postal_code is null or postal_code ~ '^[0-9]{5}$');
