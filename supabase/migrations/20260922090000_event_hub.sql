-- The Event Hub: the screen a shop puts on the television all night.
--
-- What it replaces is a YouTube countdown on a TV and a whiteboard, so
-- the bar is not "does it store a timer" but "does it survive a Friday".
-- Two decisions in here are the whole design.
--
-- FIRST: NO COUNTDOWN IS EVER WRITTEN.
--
-- The obvious build persists the number on the wall and updates it. That
-- is four writes a second across a busy shop, it drifts the moment the
-- wifi hiccups, and refreshing the television resets the round. So the
-- row holds only what a PERSON decided - started at this instant, paused
-- with this much left, overtime began here - and every client does the
-- arithmetic against its own clock. See src/lib/event-hub/timer.ts.
--
-- The consequence worth stating: how often a display polls decides how
-- fast a PAUSE reaches the wall, and has nothing to do with whether the
-- number is right. A television that has not heard from the server in a
-- minute is still counting down correctly. That is what makes this
-- feature work on shop wifi.
--
-- SECOND: A DISPLAY BELONGS TO A STORE, NOT TO AN EVENT.
--
-- A shop runs One Piece and Flesh and Blood at neighbouring tables on
-- one night, in one physical room, which in CardFlare is one room. So
-- the game lives on the TIMER, not on the event, and `events.game` -
-- still an enum with one value - is deliberately untouched. Widening it
-- would encode "a room has one game", which is the opposite of what a
-- shop actually does.
--
-- The QR code on the display is the store's existing counter code. No
-- new way in, no second code to laminate.

begin;

-- ---------------------------------------------------------------------------
-- The display
-- ---------------------------------------------------------------------------

create table public.event_hub_displays (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  store_id uuid not null references public.stores (id) on delete cascade,
  created_by uuid references auth.users (id) on delete set null,

  -- Which television. A shop with a back room has two.
  name text not null default 'Main display',
  -- "MONDAY TCG NIGHT", under the store's own name. Optional.
  night_title text,

  /*
   * What the television authenticates with, and the reason this table
   * exists rather than reusing a session.
   *
   * Nobody is going to sign a store account into a browser on a TV that
   * lives on a shelf, and if they did, that browser would hold an
   * account that can rewrite the store's inventory. This token reaches
   * exactly one read-only payload and can be rotated from the console
   * the day a television leaves the building.
   *
   * 16 bytes of pgcrypto randomness as hex: unguessable, URL-safe, and
   * short enough to type once if it ever has to be.
   */
  token text not null default encode(gen_random_bytes(16), 'hex'),

  layout text not null default 'auto',
  -- One at a time. "Pizza is here." A second one is a newsletter.
  announcement text,
  show_flares boolean not null default true,
  show_qr boolean not null default true,
  -- Off by default: a browser will not autoplay audio anyway, and a shop
  -- that wants chimes should be the one asking for them.
  sound_enabled boolean not null default false,

  constraint event_hub_displays_name_length
    check (char_length(btrim(name)) between 1 and 60),
  constraint event_hub_displays_night_title_length
    check (night_title is null or char_length(btrim(night_title)) between 1 and 60),
  constraint event_hub_displays_announcement_length
    check (announcement is null or char_length(btrim(announcement)) between 1 and 200),
  constraint event_hub_displays_layout
    check (layout in ('auto', 'single', 'split', 'grid')),
  constraint event_hub_displays_token_shape
    check (token ~ '^[0-9a-f]{32}$')
);

comment on table public.event_hub_displays is
  'One television. Holds branding, layout and the read-only token the display authenticates with.';

comment on column public.event_hub_displays.token is
  'The read-only display identifier. Reaches one public payload and nothing else; rotatable from the store console.';

-- A token is guessed at, so a collision must be impossible rather than
-- unlikely - the same reasoning as every other code in this schema.
create unique index event_hub_displays_token_key
  on public.event_hub_displays (token);

create index event_hub_displays_store_idx
  on public.event_hub_displays (store_id, created_at);

-- ---------------------------------------------------------------------------
-- The timers
-- ---------------------------------------------------------------------------

create table public.event_hub_timers (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  display_id uuid not null
    references public.event_hub_displays (id) on delete cascade,

  -- Where it sits on the wall. Not unique: reordering two panels is two
  -- updates, and a unique index would make that a three-step dance
  -- through a temporary value for no benefit anybody can see.
  position integer not null default 0,

  /*
   * The game, as text with a check rather than an enum.
   *
   * Matches `player_games.game`, which is also text-with-a-check and
   * already uses four of these five slugs. An enum would also have meant
   * `alter type ... add value`, which cannot run inside the transaction
   * that uses it - and adding a sixth game should be an ordinary
   * migration, not a two-deploy dance.
   */
  game text not null,
  event_name text not null,
  round integer,
  format text,
  bracket text not null default 'swiss',
  preset_id text not null,

  -- Null is a deliberate "untimed", not a missing value: Lorcana single
  -- elimination and Riftbound playoffs genuinely have no clock.
  duration_seconds integer,

  status text not null default 'ready',
  started_at timestamptz,
  paused_at timestamptz,
  -- Doubles as elapsed-when-paused for an untimed round. One column,
  -- because the thing preserved is the same: where the clock was.
  remaining_ms_when_paused bigint,

  overtime_started_at timestamptz,
  -- Null in overtime means the procedure counts TURNS, not seconds -
  -- Lorcana, Riftbound and Flesh and Blood all work that way, and
  -- inventing a countdown for them would put a rule on a shop's wall
  -- that the publisher never wrote.
  overtime_duration_seconds integer,
  overtime_turn integer not null default 0,
  -- Staff can put the rules card away and bring it back.
  rules_dismissed boolean not null default false,

  constraint event_hub_timers_game
    check (game in ('one-piece', 'pokemon', 'lorcana', 'riftbound', 'flesh-and-blood')),
  constraint event_hub_timers_bracket
    check (bracket in ('swiss', 'elimination')),
  constraint event_hub_timers_status
    check (status in ('ready', 'running', 'paused', 'time_called', 'overtime', 'complete')),
  constraint event_hub_timers_event_name_length
    check (char_length(btrim(event_name)) between 1 and 60),
  constraint event_hub_timers_format_length
    check (format is null or char_length(btrim(format)) between 1 and 40),
  constraint event_hub_timers_round_range
    check (round is null or round between 1 and 99),
  constraint event_hub_timers_position_range
    check (position between 0 and 3),
  -- Eight hours. Long enough for any round anybody runs, short enough
  -- that a typo cannot put a three-day clock on a wall.
  constraint event_hub_timers_duration_range
    check (duration_seconds is null or duration_seconds between 0 and 28800),
  constraint event_hub_timers_overtime_range
    check (overtime_duration_seconds is null or overtime_duration_seconds between 0 and 3600),
  constraint event_hub_timers_turn_range
    check (overtime_turn between 0 and 10),

  /*
   * The timestamps a state actually needs.
   *
   * Without these a row can say "running" with no start stamp, and the
   * arithmetic downstream has to invent an answer for a state the
   * database allowed and nothing could have produced.
   */
  constraint event_hub_timers_running_has_start
    check (status <> 'running' or started_at is not null),
  constraint event_hub_timers_paused_has_remaining
    check (status <> 'paused' or remaining_ms_when_paused is not null),
  constraint event_hub_timers_overtime_has_start
    check (status <> 'overtime' or overtime_started_at is not null)
);

comment on table public.event_hub_timers is
  'One tournament on one display. Timestamps only - no countdown value is ever written here.';

comment on column public.event_hub_timers.overtime_duration_seconds is
  'Seconds on the overtime clock. Null means the procedure counts turns instead, which is most of them.';

-- The display asks one question of this table, several times a minute,
-- for eight hours: give me this display's timers in wall order.
create index event_hub_timers_display_idx
  on public.event_hub_timers (display_id, position, created_at);

-- ---------------------------------------------------------------------------
-- Security
-- ---------------------------------------------------------------------------

/*
 * RLS on, no policies, no grants - the pattern every table in this
 * schema follows.
 *
 * The store console reads and writes through the service role after
 * `authorizeStore` has checked membership, exactly as event creation
 * does. The television reads through the service role after its token
 * has been matched, and the payload it gets back is assembled by hand in
 * src/lib/event-hub/display-payload.ts rather than being a row of this
 * table - which is what keeps a display token from ever being a way to
 * read something a display should not show.
 */
alter table public.event_hub_displays enable row level security;
alter table public.event_hub_timers enable row level security;

revoke all on public.event_hub_displays from anon;
revoke all on public.event_hub_displays from authenticated;
revoke all on public.event_hub_timers from anon;
revoke all on public.event_hub_timers from authenticated;

commit;
