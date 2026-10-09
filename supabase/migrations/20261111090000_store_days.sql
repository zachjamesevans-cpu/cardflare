-- Store days: a room for one store on one day, opened by players
-- saying they are going, with nothing for the store to set up.
--
-- The founder (2026-10-09): "events are all posted elsewhere in the
-- respective TCG app's and it just creates an extra step for game
-- stores to set up events for people to add stuff to and coordinate...
-- I miss the simplicity of just getting into a room." So the store is
-- the room and a day is the time: a player who says "going to Mox on
-- Friday" opens Friday's room at Mox, everyone else going that day sees
-- the same roster and the same matches before arriving, and scanning
-- the counter on Friday walks into it. A night the store did post is
-- still used for its day; nothing here replaces those.
--
-- A day room is an event like any other, so the roster, the board,
-- matches, Binders I'm Bringing, attendee pages and FlareCast all work
-- on it unchanged. What makes it a day room:
--   * kind 'day' (the enum gains the value), which the phase rule opens
--     at the day's start and closes at its end on the clock alone,
--     because there is no store to press Open;
--   * plan_day, the store-local date it is for, unique per store, so a
--     second player going the same day lands in the same room;
--   * its own six-character join code, so it has an /e/<code> page.
--
-- The enum value is added outside the transaction and never used as a
-- literal below (the check casts to text), because Postgres refuses a
-- new enum value inside the transaction that added it.
alter type public.event_kind add value if not exists 'day';

begin;

alter table public.events add column if not exists plan_day date;

comment on column public.events.plan_day is
  'A day room''s store-local date: the room players open by saying they are going to the store that day. Null for every other event.';

create unique index if not exists events_one_day_room_per_store
  on public.events (store_id, plan_day)
  where plan_day is not null;

alter table public.events drop constraint if exists events_day_room_shape;
alter table public.events add constraint events_day_room_shape check (
  (kind::text = 'day') = (plan_day is not null)
  and (kind::text <> 'day' or (join_code is not null and ends_at is not null))
);

commit;
