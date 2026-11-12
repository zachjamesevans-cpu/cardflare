-- FlareCast learns Yu-Gi-Oh!, Gundam, Cyberpunk and Sorcery.
--
-- The founder (2026-11-11): "add sorcery, Gundam, cyberpunk, and yugioh
-- to FlareCast with their respective rules and timers", and on scope,
-- "FlareCast only". So the one column that changes is the timer's game.
-- The card catalogue (cards.game), what a player says they play
-- (player_games.game), an event's game (events.game) and a store's
-- games (store_games.game) keep their six: these four have clocks and
-- rules on a shop's screen and no cards behind them.
--
-- Additive: every row the old check allowed, this one allows. Safe to
-- run before or after the code that uses it, and safe to run twice.

begin;

alter table public.event_hub_timers
  drop constraint if exists event_hub_timers_game;

alter table public.event_hub_timers
  add constraint event_hub_timers_game
    check (game in (
      'one-piece', 'pokemon', 'lorcana', 'riftbound', 'flesh-and-blood', 'mtg',
      'yugioh', 'gundam', 'cyberpunk', 'sorcery'
    ));

commit;
