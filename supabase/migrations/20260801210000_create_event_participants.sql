-- Who is in an Event Room.
--
-- This is the join between a guest player and an event, and it is what turns a
-- scanned QR code into being in the room.
--
-- Presence is `last_seen_at`, refreshed when a player loads the room, and
-- "here now" is a window on that. Deliberately not websockets yet: a store
-- wants to know who is around, not who moved their thumb, and a polled
-- timestamp survives a phone locking in someone's pocket. Realtime belongs
-- with match notifications, where the latency actually matters.
--
-- The display name is not copied here. A player who fixes a typo in their name
-- should be renamed everywhere they appear, and a snapshot would leave the old
-- one in every room they had joined.

create table public.event_participants (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  player_session_id uuid not null
    references public.player_sessions (id) on delete cascade,

  joined_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),

  constraint event_participants_seen_after_joining
    check (last_seen_at >= joined_at)
);

comment on table public.event_participants is
  'A guest player present in an Event Room. Presence is last_seen_at; the display name lives on the session so a rename follows the player.';

-- Re-scanning the code must rejoin, never duplicate. Enforced here so the
-- upsert in the application has something to conflict against.
create unique index event_participants_unique_idx
  on public.event_participants (event_id, player_session_id);

-- Rendering a room lists its participants ordered by presence.
create index event_participants_event_seen_idx
  on public.event_participants (event_id, last_seen_at desc);

-- Deleting a session should not have to scan every room.
create index event_participants_session_idx
  on public.event_participants (player_session_id);

alter table public.event_participants enable row level security;

/*
 * No policies.
 *
 * A guest has no auth.uid() to key one off — that is the point of a guest
 * session. Authorisation is possession of the session cookie, checked
 * server-side, exactly as it is for `player_sessions`. A policy here would
 * expose every player in every room to anyone holding the public anon key.
 *
 * Store-side reads go through the service role too, after the same membership
 * check that guards the rest of the event.
 */
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on public.event_participants from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on public.event_participants from authenticated;
  end if;
end
$$;
