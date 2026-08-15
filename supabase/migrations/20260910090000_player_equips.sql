-- Wearing the new catalogue: one slot per category, one table for all.
--
-- The original three kinds equip through columns on players; nine more
-- columns for nine more categories would be the wrong shape. One row
-- per (player, kind) holds whatever is worn in that slot, and a new
-- category later is a check-constraint change, not a column.

begin;

create table if not exists public.player_equips (
  player_id uuid not null
    references public.players (id) on delete cascade,
  kind text not null
    check (kind in (
      'ring', 'border', 'pattern', 'animation', 'background',
      'scene', 'nameplate', 'title', 'badge'
    )),
  cosmetic_slug text not null
    references public.cosmetics (slug) on delete cascade,
  updated_at timestamptz not null default now(),
  primary key (player_id, kind)
);

alter table public.player_equips enable row level security;

comment on table public.player_equips is
  'What each player wears per catalogue category. Absent row = nothing worn.';

commit;
