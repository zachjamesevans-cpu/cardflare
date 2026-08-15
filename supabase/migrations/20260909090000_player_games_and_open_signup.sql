-- Which games a player actually plays.
--
-- Asked once, during sign-up, and kept per game rather than as a blob:
-- the whole point is the future locals feature - "these are the One
-- Piece nights near you" - and that is a query BY game, which an array
-- column would make a scan and this table makes an index walk.
--
-- The five launch games are the check constraint. Adding a sixth is a
-- migration, which is deliberate: a game here fans out into event
-- targeting, so it should arrive on purpose, not through a typo.

begin;

create table if not exists public.player_games (
  player_id uuid not null
    references public.players (id) on delete cascade,
  game text not null
    check (game in ('one-piece', 'riftbound', 'lorcana', 'mtg', 'pokemon')),
  created_at timestamptz not null default now(),
  primary key (player_id, game)
);

create index if not exists player_games_game_idx on public.player_games (game);

-- Service role only, like every player-owned table: RLS on, no policies.
alter table public.player_games enable row level security;

comment on table public.player_games is
  'Which TCGs a player plays. Chosen at sign-up, editable later; feeds locals targeting.';

commit;
