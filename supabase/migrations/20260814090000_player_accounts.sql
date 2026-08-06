-- Player accounts: optional, invite-only, and never in the way.
--
-- The product's oldest promise stays intact: a player scans a counter code,
-- types a nickname and is trading — no account at the door. What an account
-- adds is continuity for the people who want it: wants that follow them
-- between stores, a collection upload that powers matches, and "post these
-- again?" the next time they walk into a room.
--
-- The shape that makes both true at once: guest sessions stay the unit of
-- room participation, and a `players` row (bound to an auth user) can claim
-- a session via `player_sessions.player_id`. Everything room-scoped keys on
-- the session exactly as before; everything durable keys on the player.

begin;

/* -------------------------------------------------------------------------- */
/* 1. The persistent player, one per auth user                                */
/* -------------------------------------------------------------------------- */

create table public.players (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  display_name text not null
    check (char_length(display_name) between 1 and 40)
);

comment on table public.players is
  'A persistent player identity. Optional: guests trade without one.';

/* -------------------------------------------------------------------------- */
/* 2. Invitations, mirroring store_invites                                    */
/* -------------------------------------------------------------------------- */

create table public.player_invites (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  email text not null check (char_length(email) between 3 and 320),
  display_name text not null
    check (char_length(display_name) between 1 and 40),
  invited_by uuid references auth.users (id) on delete set null,
  accepted_at timestamptz,
  accepted_by uuid references auth.users (id) on delete set null
);

-- One open invitation per address; accepted ones stay as history.
create unique index player_invites_open_email_idx
  on public.player_invites (email)
  where accepted_at is null;

/* -------------------------------------------------------------------------- */
/* 3. Saved wants: the durable version of a Flare                             */
/* -------------------------------------------------------------------------- */

create table public.player_wants (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  player_id uuid not null references public.players (id) on delete cascade,
  card_id uuid not null references public.cards (id) on delete cascade,
  -- Null means any printing will do, same meaning as on a Flare.
  printing_id uuid references public.card_printings (id) on delete cascade,
  quantity integer not null default 1 check (quantity between 1 and 99),
  note text check (note is null or char_length(note) <= 200),

  -- Re-saving the same ask updates it rather than stacking duplicates.
  constraint player_wants_one_per_ask
    unique nulls not distinct (player_id, card_id, printing_id)
);

create index player_wants_player_idx on public.player_wants (player_id);

/* -------------------------------------------------------------------------- */
/* 4. The imported collection (Collectr et al), aggregated per card           */
/* -------------------------------------------------------------------------- */

-- Private on purpose: this powers matching and is never listed to a room.
-- Same shape and reasoning as store_singles: one row per card, quantities
-- summed, no prices anywhere by construction.
create table public.player_collection (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  player_id uuid not null references public.players (id) on delete cascade,
  card_id uuid not null references public.cards (id) on delete cascade,
  quantity integer not null check (quantity > 0),

  constraint player_collection_one_per_card unique (player_id, card_id)
);

create table public.player_collection_syncs (
  player_id uuid primary key references public.players (id) on delete cascade,
  synced_at timestamptz not null default now(),
  lines_seen integer not null check (lines_seen >= 0),
  cards_matched integer not null check (cards_matched >= 0),
  lines_unmatched integer not null check (lines_unmatched >= 0)
);

/* -------------------------------------------------------------------------- */
/* 5. A session can belong to a player                                        */
/* -------------------------------------------------------------------------- */

-- Set-null on purpose: deleting an account must not delete the room history
-- the rest of a room can see (trades reference sessions), only unlink it.
alter table public.player_sessions
  add column player_id uuid references public.players (id) on delete set null;

create index player_sessions_player_idx
  on public.player_sessions (player_id)
  where player_id is not null;

/* -------------------------------------------------------------------------- */
/* 6. Same security stance as every table before them                         */
/* -------------------------------------------------------------------------- */

alter table public.players enable row level security;
alter table public.player_invites enable row level security;
alter table public.player_wants enable row level security;
alter table public.player_collection enable row level security;
alter table public.player_collection_syncs enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array[
    'players', 'player_invites', 'player_wants',
    'player_collection', 'player_collection_syncs'
  ] loop
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('revoke all on public.%I from anon', t);
    end if;
    if exists (select 1 from pg_roles where rolname = 'authenticated') then
      execute format('revoke all on public.%I from authenticated', t);
    end if;
  end loop;
end $$;

commit;
