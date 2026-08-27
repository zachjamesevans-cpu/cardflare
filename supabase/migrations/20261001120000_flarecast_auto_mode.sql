-- FlareCast Auto Mode: the tournament runs the room between rounds.
--
-- Nothing here stores a countdown. The intermission is DERIVED, exactly
-- like TIME IN ROUND always was: the deadline for the next round is
-- when time hit, plus the configured length, plus whatever the
-- organizer added — three facts a person decided, and every device
-- works the rest out from its own clock. What these columns hold is
-- only what somebody chose.

alter table public.event_hub_timers
  -- The opt-in. Off means FlareCast behaves exactly as it does today.
  add column auto_mode boolean not null default false,

  -- Whether the next round starts itself when the target hits zero.
  -- Off turns the countdown into "waiting for organizer" at zero.
  add column auto_start boolean not null default true,

  -- The between-rounds window. 180 is the recommended default.
  add column intermission_seconds integer not null default 180,

  -- Every +2 MIN and every held span folds into this one number, so
  -- the deadline stays a single sum of decisions rather than a state.
  add column intermission_extended_ms bigint not null default 0,

  -- Set while the organizer has pressed HOLD. The countdown freezes at
  -- whatever it read at this instant, and nothing starts until they
  -- resume or start the round by hand.
  add column auto_held_at timestamptz,

  -- When time was called BY HAND, which can be earlier than the clock.
  -- The intermission anchors here when it exists, on regulation's own
  -- end otherwise, so an early call and a natural zero behave the same.
  add column time_called_at timestamptz;

alter table public.event_hub_timers
  -- Thirty seconds to an hour. Wide enough for any real store night,
  -- narrow enough that a typo cannot schedule tomorrow.
  add constraint event_hub_timers_intermission_range
    check (intermission_seconds between 30 and 3600);

-- What Auto Mode did, for the debugging conversation that starts
-- "round four started itself at 8:14, why". Meaningful transitions
-- only — never a tick, never a poll.
create table public.event_hub_timer_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  timer_id uuid not null
    references public.event_hub_timers (id) on delete cascade,
  kind text not null,
  detail text,

  constraint event_hub_timer_log_kind
    check (kind in (
      'round-started', 'auto-held', 'auto-resumed', 'auto-extended',
      'auto-on', 'auto-off'
    )),
  constraint event_hub_timer_log_detail_length
    check (detail is null or char_length(detail) <= 200)
);

create index event_hub_timer_log_timer
  on public.event_hub_timer_log (timer_id, created_at desc);

-- Same posture as every other table: RLS on, no policies, service role
-- only. A display token or a browser never reads this directly.
alter table public.event_hub_timer_log enable row level security;
