-- The notification backbone, ahead of the native app.
--
-- The gap it closes: an offer lands on your Flare while your phone is
-- locked, and nothing tells you. Notifications are recorded here per
-- *player* — accounts only, guests keep their polling room page — and
-- delivered over whatever channels the player has: email today, push
-- tokens the day the app registers them. The table doubles as the app's
-- future inbox, which is why rows carry display fields, not just event
-- references.

begin;

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  player_id uuid not null references public.players (id) on delete cascade,
  kind text not null check (kind in ('offer-received', 'trade-confirmed')),
  title text not null check (char_length(title) between 1 and 200),
  body text check (body is null or char_length(body) <= 500),
  -- A site-relative path (the room to open), never an absolute URL.
  url text check (url is null or char_length(url) <= 200),
  -- One notification per underlying event: re-offering with a new message
  -- must update the room, not ping the phone again.
  dedupe_key text unique,
  read_at timestamptz,
  emailed_at timestamptz
);

create index notifications_player_idx
  on public.notifications (player_id, created_at desc);

-- Where the app will register for push. One row per device token; a token
-- moving to another account (shared iPad, reinstall) re-inserts under the
-- new player because the token is unique.
create table public.player_devices (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  player_id uuid not null references public.players (id) on delete cascade,
  platform text not null check (platform in ('ios', 'android', 'web')),
  push_token text not null unique
    check (char_length(push_token) between 1 and 4096),
  last_seen_at timestamptz not null default now()
);

create index player_devices_player_idx on public.player_devices (player_id);

alter table public.notifications enable row level security;
alter table public.player_devices enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['notifications', 'player_devices'] loop
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('revoke all on public.%I from anon', t);
    end if;
    if exists (select 1 from pg_roles where rolname = 'authenticated') then
      execute format('revoke all on public.%I from authenticated', t);
    end if;
  end loop;
end $$;

commit;
