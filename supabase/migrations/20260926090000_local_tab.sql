-- The Local tab: the room's question, asked across a whole area.
--
-- The founder's direction: the Room tab goes (a live room becomes a
-- banner on the Feed), and its place in the bar goes to Local — every
-- open Flare posted at a store near you, with a way to message the
-- person directly about the card. Four decisions, each made explicitly:
-- the tab is called Local; "near you" is a radius the player sets
-- around a home store they pick; messaging is a thread tied to one
-- Flare, never an open DM box; and the room keeps working from the
-- Feed's banner.
--
-- WHERE "near" is measured from is already decided and already built:
-- the founder's correction on the first nearby cut — "asking for
-- location permissions ... or at the very least asking for a zip code
-- ... nothing to do with 'my store'" — gave players/location.ts its two
-- sources, a device coordinate that rides one request and is never
-- stored, or the profile's five-digit ZIP resolved to a centroid. Local
-- reuses that origin unchanged; the only new setting is how FAR.
--
-- THREADS NEED ACCOUNTS ON BOTH SIDES. A guest session expires in 30
-- days and has no inbox; a message that outlives its sender is a
-- letter to nobody. A guest's Flare still shows in Local — it is
-- honestly posted — but the message button needs the author to have
-- signed in, and the server refuses quietly when they have not.

begin;

/* -------------------------------------------------------------------------- */
/* 1. How far a player will drive                                             */
/* -------------------------------------------------------------------------- */

alter table public.players
  add column if not exists local_radius_miles smallint not null default 50;

alter table public.players
  drop constraint if exists players_local_radius_offered;

alter table public.players
  add constraint players_local_radius_offered
    check (local_radius_miles in (10, 25, 50, 100));

comment on column public.players.local_radius_miles is
  'How far Local reaches from the player''s origin, in miles. One of the offered steps.';

/* -------------------------------------------------------------------------- */
/* 2. A conversation about one Flare                                          */
/* -------------------------------------------------------------------------- */

create table public.flare_threads (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),

  flare_id uuid not null references public.flares (id) on delete cascade,

  /*
   * Both ends are ACCOUNTS. The author is resolved from the Flare's
   * session at the moment the thread opens and denormalised here, so
   * the conversation survives the session that posted the Flare —
   * sessions expire in 30 days and a conversation about a card should
   * not.
   */
  author_player_id uuid not null references public.players (id) on delete cascade,
  responder_player_id uuid not null
    references public.players (id) on delete cascade,

  /* Ordering the inbox without aggregating messages on every read. */
  last_message_at timestamptz not null default now(),

  /*
   * Either side can end it, and an ended thread takes no more messages.
   * There is deliberately no reopen: "stop messaging me" has to mean
   * something, and this is the whole of v1's safety surface.
   */
  closed_at timestamptz,
  closed_by uuid references public.players (id),

  constraint flare_threads_two_people
    check (author_player_id <> responder_player_id)
);

comment on table public.flare_threads is
  'One conversation about one Flare, between its author and one responder. Accounts on both ends, deliberately.';

/* Answering the same Flare twice is the same conversation. */
create unique index flare_threads_unique_idx
  on public.flare_threads (flare_id, responder_player_id);

create index flare_threads_author_idx
  on public.flare_threads (author_player_id, last_message_at desc);
create index flare_threads_responder_idx
  on public.flare_threads (responder_player_id, last_message_at desc);

create table public.flare_messages (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),

  thread_id uuid not null references public.flare_threads (id) on delete cascade,
  sender_player_id uuid not null references public.players (id) on delete cascade,

  body text not null,

  /* When the OTHER party read it. Null means unread, which is what the
     inbox badge counts. */
  read_at timestamptz,

  constraint flare_messages_body_bounded
    check (char_length(btrim(body)) between 1 and 500)
);

comment on table public.flare_messages is
  'One message in a Flare thread. 500 characters: a conversation about a card, not a letter.';

create index flare_messages_thread_idx
  on public.flare_messages (thread_id, created_at);

/*
 * Same stance as flares, offers and binders: RLS on, zero policies,
 * privileges revoked. The tables do not exist through the public
 * PostgREST API; every read and write goes through the service role
 * after the server has proved who is asking.
 */
alter table public.flare_threads enable row level security;
alter table public.flare_messages enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['flare_threads', 'flare_messages'] loop
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('revoke all on public.%I from anon', t);
    end if;
    if exists (select 1 from pg_roles where rolname = 'authenticated') then
      execute format('revoke all on public.%I from authenticated', t);
    end if;
  end loop;
end $$;

/* -------------------------------------------------------------------------- */
/* 3. The notification a message sends                                        */
/* -------------------------------------------------------------------------- */

/*
 * The kinds list is a check constraint, so widening it is a drop and
 * re-add. Named constraint, so this is precise rather than guesswork.
 */
alter table public.notifications
  drop constraint if exists notifications_kind_check;

alter table public.notifications
  add constraint notifications_kind_check
    check (kind in (
      'offer-received',
      'trade-confirmed',
      'early-board',
      'board-open',
      'new-follower',
      'room-flare',
      'message-received'
    ));

commit;
