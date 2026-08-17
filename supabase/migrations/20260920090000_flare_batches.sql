-- A deck posted at once is one act, not thirty.
--
-- OP-17 lands this week and the founder wants players posting whole
-- want lists ahead of it: "if you're building a massive deck, I don't
-- want all of those notifications to show up as separate posts or
-- notifications in the feed."
--
-- Both of those are true today and both are per-card. `notifyRoomFlare`
-- pushes once per Flare, so a thirty-card deck is thirty notifications
-- to everyone standing in the room. The Feed builds one hunt item per
-- Flare, so one friend posting a deck is the only thing anybody else
-- sees.
--
-- Grouping needs an identity. `deck_label` looks like one and is not: it
-- is optional, it is chosen by the player, two different sittings can
-- share a label, and a loose post has none at all. Guessing from
-- timestamps would be worse — a batch is exactly "these went up in one
-- action", and only the action knows that.
--
-- So the action stamps it. One uuid per posting call, carried on every
-- Flare it writes, including a batch of one.

begin;

alter table public.flares add column if not exists posted_batch uuid;

comment on column public.flares.posted_batch is
  'The posting action that created this Flare. Shared by every Flare posted in one go, so a deck notifies once and reads as one item. Null for Flares posted before batches existed.';

/*
 * Null on every existing row, deliberately. A backfill would have to
 * invent batches out of timestamps, and a Flare posted alone last week
 * genuinely has no batch — saying so is more honest than grouping rows
 * that were never grouped. Readers treat null as "a batch of one",
 * which is what those Flares were.
 */

/*
 * The Feed reads a board's Flares and groups by poster and batch, so
 * this is the shape it asks for. Partial: most rows are null while the
 * pilot's existing boards age out, and there is nothing to say about
 * those.
 */
create index if not exists flares_batch_idx
  on public.flares (event_id, player_session_id, posted_batch)
  where posted_batch is not null;

commit;
