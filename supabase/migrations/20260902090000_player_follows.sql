-- Follows: one player choosing to keep up with another.
--
-- The founder's option C: one-way follows anyone can make, no approval
-- step, and when two players follow each other the product reads them
-- as Trade partners. Counts exist as rows and are deliberately shown
-- nowhere yet; whether follower counts ever go public is an open
-- product decision, and hiding a number is easier than unshipping one.
--
-- RLS is enabled with no policies: every read and write goes through
-- the server with the service role, the same trust shape as the rest
-- of the player tables. A follow is not secret data, but who follows
-- whom is social graph, and the server deciding what leaves it is the
-- whole privacy story here.

create table if not exists public.player_follows (
  follower_id uuid not null references public.players (id) on delete cascade,
  followed_id uuid not null references public.players (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, followed_id),
  constraint player_follows_no_self check (follower_id <> followed_id)
);

create index if not exists player_follows_followed_idx
  on public.player_follows (followed_id);

alter table public.player_follows enable row level security;
