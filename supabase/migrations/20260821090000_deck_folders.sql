-- Deck folders: a Flare can belong to a named hunt.
--
-- The founder's example is the whole spec: somebody building an RG
-- Luffy needs fourteen cards, and fourteen loose rows bury both the
-- deck and everyone else's board. A label ("RG Luffy") groups them
-- under one folder in the player's section, and the same label rides
-- the saved want, so the hunt re-posts as a folder at the next store
-- instead of dissolving back into loose cards.
--
-- A label, not a decks table: the folder has no life of its own - no
-- membership, no owner, no state to drift. Null means what it always
-- did: a card wanted on its own.

begin;

alter table public.flares
  add column deck_label text
    check (deck_label is null or char_length(btrim(deck_label)) between 1 and 40);

comment on column public.flares.deck_label is
  'Groups a player''s Flares under a named hunt. Null = a loose card.';

alter table public.player_wants
  add column deck_label text
    check (deck_label is null or char_length(btrim(deck_label)) between 1 and 40);

comment on column public.player_wants.deck_label is
  'The hunt this want belongs to, so it re-posts as a folder.';

commit;
