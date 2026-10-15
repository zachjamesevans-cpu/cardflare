-- A note on each card of a Flare.
--
-- The founder (2026-10-12): "what do you think about allowing people to
-- attach notes to individual cards when posting a flare? ... let's say
-- there's 10 people looking for a card you have ... how do you choose who
-- to message? it should have their note under it ... someone could have a
-- note that says 'for PC' under a shanks card, whereas someone could have
-- that same card up as a flare but say they're building a deck."
--
-- Its own column because `flares.note` already carries the post's
-- caption, written on the post's first card. Short on purpose: a reason,
-- not a paragraph - it is read in a list of ten people. Null is no note.
-- A saved want's note (`player_wants.note`, 200) is the same idea and
-- already exists.

alter table public.flares
  add column if not exists card_note text
    check (card_note is null or char_length(card_note) <= 80);

comment on column public.flares.card_note is
  'Why this card, in the poster''s words ("For my PC", "Building a deck"). Shown under the card when it is opened and on Wanted near you. Not the caption: that is flares.note on the first card.';
