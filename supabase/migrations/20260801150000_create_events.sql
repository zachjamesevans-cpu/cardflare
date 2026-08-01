-- Event Rooms: a live digital room tied to a physical TCG event.
--
-- Security model, consistent with the tables before it:
--   * A store's members read their own store's events. Admins read all.
--   * There are no insert, update or delete policies. Every write goes through
--     the service role after an application-level authorisation check.
--   * The public join page resolves a code with the service role and returns
--     only the handful of columns a player is allowed to see. The table itself
--     stays unreadable through the public API.

create type public.event_status as enum ('draft', 'open', 'closed');

-- One Piece first. The column exists now so that adding a game later is a new
-- enum value rather than a migration that rewrites every row.
create type public.game as enum ('one_piece');

create table public.events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  store_id uuid not null references public.stores (id) on delete cascade,
  created_by uuid references auth.users (id) on delete set null,

  name text not null,
  game public.game not null default 'one_piece',
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status public.event_status not null default 'draft',

  /*
   * The code a player types when they cannot scan.
   *
   * Crockford's base32: digits, minus the letters that collide with them —
   * I and L (read as 1), O (as 0), and U. It gets read off a printed sheet
   * across a counter, so keeping the digit and dropping the letter means a
   * mishearing has exactly one sensible correction. See src/lib/events/join-code.ts.
   */
  join_code text not null,

  constraint events_name_length
    check (char_length(btrim(name)) between 1 and 80),
  constraint events_name_is_trimmed
    check (name = btrim(name)),
  constraint events_ends_after_start
    check (ends_at > starts_at),
  constraint events_join_code_shape
    check (join_code ~ '^[0-9A-HJKMNP-TV-Z]{6}$')
);

comment on table public.events is
  'An Event Room: a live digital room tied to one physical event at one store.';

comment on column public.events.join_code is
  'Typed by players who cannot scan the QR code. Unambiguous alphabet, uppercase.';

-- Codes are handed out by scanning or reading aloud, so collisions must be
-- impossible rather than unlikely.
create unique index events_join_code_key on public.events (join_code);

create index events_store_id_starts_at_idx
  on public.events (store_id, starts_at desc);

alter table public.events enable row level security;

/*
 * Granted explicitly rather than relying on the host's default privileges.
 *
 * A policy only narrows an existing grant — it never creates one. Supabase
 * happens to grant table privileges to `authenticated` by default, but a
 * migration that depends on that silently produces "permission denied" on any
 * database configured differently. Select only: writes have no policy at all.
 */
grant select on public.events to authenticated;

create policy "members and admins read their events"
  on public.events for select
  to authenticated
  using (public.is_admin() or public.is_store_member(store_id));

-- No insert, update or delete policies, deliberately. A store creating an
-- event goes through a Server Action that checks membership first; a policy
-- here would also let it rewrite another store's event by id.

-- The public join page reads through the service role, which bypasses RLS, and
-- selects only the columns a player may see. Nothing here is reachable with
-- the anon key.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on public.events from anon;
  end if;
end
$$;
