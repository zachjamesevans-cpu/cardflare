-- "Open to trades": a player who is not after anything specific.
--
-- Plenty of people at a locals are not hunting a card. A newer player has
-- never seen most of what is in the binders around them and cannot name what
-- they want; somebody else just fancies trading. Until now CardFlare had no
-- way to say that, so those people were invisible on the Flare board — which
-- is the surface everyone actually scans.
--
-- Why a column here rather than a Flare with no card:
--
--   * A Flare is a request for a card. Making `card_id` nullable to hold
--     "nothing in particular" would weaken a constraint that carries real
--     meaning, and put a row that is not a card request into a list built to
--     show cards.
--   * This is a property of a person in a room, and `event_participants` is
--     exactly the row that means "this person is in this room". The existing
--     unique index on (event_id, player_session_id) makes it one per player
--     per room for free — no separate deduplication to write.
--
-- Why per room rather than on the player session: somebody can be up for
-- anything at Friday locals and heads-down at a tournament. It also expires by
-- itself — leaving the room drops the row — which avoids the stale-signal
-- problem the binder needed a confirmation step to solve.

begin;

alter table public.event_participants
  add column open_to_trades boolean not null default false;

comment on column public.event_participants.open_to_trades is
  'The player is not after anything specific and will consider any trade. Shown to the whole room, unlike the Have list.';

/*
 * Finding the open players in one room.
 *
 * A partial index because the interesting rows are the true ones, and in a
 * busy room most players will have named something specific instead.
 */
create index event_participants_open_to_trades_idx
  on public.event_participants (event_id)
  where open_to_trades;

commit;
