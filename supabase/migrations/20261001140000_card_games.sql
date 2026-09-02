-- One vocabulary for "which game", everywhere.
--
-- Three lists had grown up: `cards.game` and `events.game` were the
-- `public.game` enum with its single value 'one_piece'; `player_games`
-- and `event_hub_timers` are text with a check, spelt 'one-piece'. The
-- room's QR carries the hyphenated form and `search_cards` compared it
-- to the enum's text, so 'one-piece' = 'one_piece' was false and every
-- game-scoped room search answered with nothing. This migration makes
-- the card and event columns text-with-a-check like the newer tables,
-- respells the one value that existed, and widens every check to the
-- six games the catalogue now carries: One Piece, Riftbound, Lorcana,
-- Magic, Pokémon and Flesh and Blood.
--
-- Text with a check rather than `alter type ... add value`: a new enum
-- value cannot be used in the transaction that adds it, which turns
-- adding a game into a two-deploy dance. The Event Hub chose text for
-- exactly this reason, and now the cards do too.
--
-- `search_cards` needs no change: it already compares `c.game::text`,
-- and casting text to text is nothing.

begin;

-- 1. cards.game: enum -> text, respelt, checked.
alter table public.cards
  alter column game drop default;

alter table public.cards
  alter column game type text using game::text;

update public.cards set game = 'one-piece' where game = 'one_piece';

alter table public.cards
  alter column game set default 'one-piece';

alter table public.cards
  add constraint cards_game_check
    check (game in ('one-piece', 'riftbound', 'lorcana', 'mtg', 'pokemon', 'flesh-and-blood'));

-- 2. events.game: the same treatment. The column is barely read (the
--    game lives on the timer, per the Event Hub migration), but it must
--    not be left as the only thing still spelt the old way.
alter table public.events
  alter column game drop default;

alter table public.events
  alter column game type text using game::text;

update public.events set game = 'one-piece' where game = 'one_piece';

alter table public.events
  alter column game set default 'one-piece';

alter table public.events
  add constraint events_game_check
    check (game in ('one-piece', 'riftbound', 'lorcana', 'mtg', 'pokemon', 'flesh-and-blood'));

-- 3. The enum has no remaining users.
drop type if exists public.game;

-- 4. player_games learns Flesh and Blood.
alter table public.player_games
  drop constraint if exists player_games_game_check;

alter table public.player_games
  add constraint player_games_game_check
    check (game in ('one-piece', 'riftbound', 'lorcana', 'mtg', 'pokemon', 'flesh-and-blood'));

-- 5. The Event Hub learns Magic.
alter table public.event_hub_timers
  drop constraint if exists event_hub_timers_game;

alter table public.event_hub_timers
  add constraint event_hub_timers_game
    check (game in ('one-piece', 'pokemon', 'lorcana', 'riftbound', 'flesh-and-blood', 'mtg'));

comment on column public.cards.game is
  'Which TCG the card belongs to. The same slugs as player_games.game and event_hub_timers.game.';

commit;
