-- Push: four switches on the account, and the tickets a push leaves behind.
--
-- The founder (2026-10-03): "I think you need to do a pass on push
-- notifications." Every notice pushed with no way to turn any of
-- them off, which is the first thing a player who gets five "somebody
-- wants your card" pushes in a night looks for. Four switches, one
-- per kind of thing worth a buzz, on by default; the Inbox keeps every
-- notice whatever the switches say, only the push is gated.
--
-- Tickets: Expo answers a send with a ticket per device, and only a
-- receipt fetched LATER says "DeviceNotRegistered" for a phone that
-- deleted the app. The tickets are kept so a daily pass can read the
-- receipts and prune the dead tokens; a row leaves with its device.
--
-- Service role only: RLS on, no policies, like every table here.
begin;

alter table public.players
  add column if not exists push_offers boolean not null default true,
  add column if not exists push_messages boolean not null default true,
  add column if not exists push_nights boolean not null default true,
  add column if not exists push_social boolean not null default true;

comment on column public.players.push_offers is
  'Push for offers on your Flares and confirmed trades. The Inbox keeps the notice either way.';
comment on column public.players.push_messages is 'Push for new messages in a conversation.';
comment on column public.players.push_nights is
  'Push for boards opening, matches before a night, and Flares in a room you are in.';
comment on column public.players.push_social is
  'Push for new followers, comments, and posts from stores you follow.';

create table if not exists public.push_tickets (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  ticket_id text not null unique,
  device_id uuid not null references public.player_devices (id) on delete cascade
);

create index if not exists push_tickets_created_idx on public.push_tickets (created_at);

alter table public.push_tickets enable row level security;

commit;
