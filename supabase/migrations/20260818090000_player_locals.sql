-- Your locals: the stores a player actually goes to, remembered.
--
-- Saved automatically, never asked for: the first time a signed-in player
-- joins a room at a store, that store becomes one of their locals. History
-- *is* the setup. From then on the store is reachable without a QR code —
-- its next event, its live board — and later phases build on this fact:
-- early boards to post into before driving over, and the night-before
-- digest that tells someone which cards to bring from home.
--
-- Rows are private to the player (surfaced only through the service role,
-- like everything else); there is no public list of who considers a store
-- their local. Deleting a player or a store takes the association with it.

begin;

create table public.player_locals (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  player_id uuid not null references public.players (id) on delete cascade,
  store_id uuid not null references public.stores (id) on delete cascade,
  unique (player_id, store_id)
);

comment on table public.player_locals is
  'Stores a player frequents. Saved on first signed-in join; removable.';

create index player_locals_player_idx
  on public.player_locals (player_id, created_at desc);

alter table public.player_locals enable row level security;

revoke all on public.player_locals from anon;
revoke all on public.player_locals from authenticated;

commit;
