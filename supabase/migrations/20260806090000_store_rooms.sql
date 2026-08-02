-- Store Rooms: a permanent join code per store, and the walk-in room it opens.
--
-- Until now every room was a scheduled event, so a store printed a new sheet
-- for every Friday night. A store asked for one code they could laminate and
-- leave on the counter. That code has to behave sensibly on a night when a
-- tournament is running and on a quiet Tuesday afternoon alike, which is what
-- the two additions below are for:
--
--   * stores.join_code       the permanent code, printed once
--   * events.kind            distinguishes a scheduled event from a walk-in
--                            room the application opened by itself
--
-- The resolver in src/lib/events/rooms.ts sends a store code to whichever room
-- is live: a running scheduled event if there is one, so the room does not
-- split in half on tournament night, otherwise the walk-in room.
--
-- Security model is unchanged. Neither column is readable by anon; a store
-- reads its own row through the existing select policy, and every write still
-- goes through the service role after an application-level check.

begin;

-- ---------------------------------------------------------------------------
-- Stores: the permanent code, and the switch that governs it
-- ---------------------------------------------------------------------------

alter table public.stores
  add column join_code text,
  -- On by default: a store that prints the sheet expects scanning it to work.
  -- Turning this off is how a store says "only during events we scheduled".
  add column walk_in_enabled boolean not null default true;

/*
 * Backfills a code for every store that already exists.
 *
 * Randomness comes from gen_random_uuid() rather than random(): this code is
 * the only thing standing between a stranger and a store's trading room, and
 * random() is seeded per-session and entirely predictable. Each pair of hex
 * digits is a byte, and 256 divides evenly by the 32-symbol alphabet, so the
 * modulo introduces no bias.
 *
 * Seven characters, not six — see the events table below for why the two code
 * spaces are kept different lengths.
 */
do $$
declare
  alphabet constant text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  target record;
  candidate text;
  hex text;
begin
  for target in select id from public.stores loop
    loop
      candidate := '';
      hex := replace(gen_random_uuid()::text, '-', '');

      for position in 0..6 loop
        candidate := candidate || substr(
          alphabet,
          1 + (('x' || substr(hex, 1 + position * 2, 2))::bit(8)::int % 32),
          1
        );
      end loop;

      exit when not exists (
        select 1 from public.stores where join_code = candidate
      );
    end loop;

    update public.stores set join_code = candidate where id = target.id;
  end loop;
end
$$;

alter table public.stores
  alter column join_code set not null;

alter table public.stores
  add constraint stores_join_code_shape
    check (join_code ~ '^[0-9A-HJKMNP-TV-Z]{7}$');

-- Read off a counter and typed by strangers, so collisions must be impossible
-- rather than unlikely — the same reasoning as events.join_code.
create unique index stores_join_code_key on public.stores (join_code);

comment on column public.stores.join_code is
  'The permanent code on the store''s counter. Seven characters, so it can never collide with a six-character event code.';

comment on column public.stores.walk_in_enabled is
  'Whether scanning the store code opens a walk-in room when no scheduled event is running.';

-- ---------------------------------------------------------------------------
-- Events: scheduled ones, and the ones the application opens by itself
-- ---------------------------------------------------------------------------

create type public.event_kind as enum ('scheduled', 'walk_in');

alter table public.events
  add column kind public.event_kind not null default 'scheduled';

comment on column public.events.kind is
  'scheduled: a store named it and set its window. walk_in: opened automatically when somebody scanned the store code, closed after the idle window.';

/*
 * A walk-in room has no planned finish, so ends_at is stamped when it closes.
 *
 * Leaving the column not-null would have meant inventing a finishing time at
 * the moment the room opened, and then having to defend that invention every
 * time the room outlived it.
 */
alter table public.events
  alter column ends_at drop not null;

alter table public.events
  drop constraint events_ends_after_start;

alter table public.events
  add constraint events_ends_after_start
    check (ends_at is null or ends_at > starts_at);

alter table public.events
  add constraint events_scheduled_has_end
    check (kind <> 'scheduled' or ends_at is not null);

/*
 * A walk-in room is reached only through its store's permanent code, so it has
 * no code of its own.
 *
 * A per-session code would be a second way in that is printed nowhere and
 * changes every time the room reopens. Null instead, which also keeps
 * findEventByJoinCode from ever resolving one: a walk-in room must be reached
 * through the resolver, which is the only thing that knows whether it is still
 * the live room.
 */
alter table public.events
  alter column join_code drop not null;

alter table public.events
  add constraint events_scheduled_has_join_code
    check (kind <> 'scheduled' or join_code is not null);

alter table public.events
  add constraint events_walk_in_has_no_join_code
    check (kind <> 'walk_in' or join_code is null);

/*
 * At most one walk-in room open per store, enforced here rather than in the
 * application.
 *
 * Two players scanning the counter code at the same moment both find no open
 * room and both try to open one. Without this index that race splits the room
 * in half — two rooms at one counter, each showing half the Flares, which is
 * the one outcome this whole feature exists to prevent. With it the loser gets
 * a unique violation and adopts the winner's room.
 */
create unique index events_one_open_walk_in_per_store
  on public.events (store_id)
  where kind = 'walk_in' and status = 'open';

-- Finding a store's current walk-in room, and listing past ones.
create index events_store_kind_starts_at_idx
  on public.events (store_id, kind, starts_at desc);

commit;
