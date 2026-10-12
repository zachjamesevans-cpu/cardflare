-- The pity rule: a guaranteed Epic or better after nine packs without.
--
-- From the Embers review (2026-10-11), step 5. A duplicate comes back as
-- 40 Embers of a 300-Ember pack, so a long run of commons was money
-- down a well. Each player's run is counted per set; after nine packs
-- with no Epic or Legendary, the tenth is guaranteed one, and any Epic
-- or Legendary resets the count. The rule lives in
-- src/lib/packs/manifest.ts (PITY_AFTER, drawPackWithPity).
--
-- Safe to run twice.

begin;

create table if not exists public.player_pack_pity (
  player_id uuid not null references public.players (id) on delete cascade,
  series text not null,
  packs_without_top integer not null default 0
    check (packs_without_top >= 0),
  primary key (player_id, series)
);

-- Only ever read and written through the service role, like player_packs.
alter table public.player_pack_pity enable row level security;
revoke all on public.player_pack_pity from anon, authenticated;

commit;
