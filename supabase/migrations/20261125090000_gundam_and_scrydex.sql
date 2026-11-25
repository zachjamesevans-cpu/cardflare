-- Gundam, with the move to Scrydex as the one card source (2026-11-25).
--
-- The founder: "english only for now. also yes add gundam." Scrydex
-- carries the Gundam Card Game, so it joins the games a card, an event,
-- a player and a store may name. Nothing else changes here: the cards
-- themselves arrive through the importer (npm run cards:import), and the
-- FlareCast timers keep their own curated list.

begin;

alter table public.cards drop constraint if exists cards_game_check;
alter table public.cards
  add constraint cards_game_check
    check (game in ('one-piece', 'riftbound', 'lorcana', 'mtg', 'pokemon', 'flesh-and-blood', 'gundam'));

alter table public.events drop constraint if exists events_game_check;
alter table public.events
  add constraint events_game_check
    check (game in ('one-piece', 'riftbound', 'lorcana', 'mtg', 'pokemon', 'flesh-and-blood', 'gundam'));

alter table public.player_games drop constraint if exists player_games_game_check;
alter table public.player_games
  add constraint player_games_game_check
    check (game in ('one-piece', 'riftbound', 'lorcana', 'mtg', 'pokemon', 'flesh-and-blood', 'gundam'));

alter table public.store_games drop constraint if exists store_games_game_check;
alter table public.store_games
  add constraint store_games_game_check
    check (game in ('one-piece', 'riftbound', 'lorcana', 'mtg', 'pokemon', 'flesh-and-blood', 'gundam'));

commit;
