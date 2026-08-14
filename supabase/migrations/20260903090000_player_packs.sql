-- CardFlare packs: sealed cosmetic packs, opened for three pulls.
--
-- A row is one sealed pack. Opening claims the row (opened_at set in
-- the same guarded update that reads it, so a pack cannot be opened
-- twice) and the server draws the contents by the series' odds at that
-- moment - nothing about the contents is stored beforehand, so there
-- is nothing to peek at. Series live in code (src/lib/packs/<series>),
-- one folder per set; this table only needs to know the name.
--
-- source records where a pack came from: every new account gets one
-- 'signup' Origin pack, and 'purchase' rows are bought with Embers.

create table if not exists public.player_packs (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players (id) on delete cascade,
  series text not null default 'origin',
  source text not null check (source in ('signup', 'purchase')),
  created_at timestamptz not null default now(),
  opened_at timestamptz
);

create index if not exists player_packs_unopened_idx
  on public.player_packs (player_id)
  where opened_at is null;

alter table public.player_packs enable row level security;
