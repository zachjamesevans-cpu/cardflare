-- Guest player sessions.
--
-- A player at a counter must be able to scan a code and be in the room in
-- seconds. Requiring an account there would break the core loop at exactly the
-- point it has to be frictionless, so players get an identity with no email,
-- no password and nothing to remember: a display name and a cookie.
--
-- Security model:
--   * The cookie carries a random token. Only its SHA-256 is stored, so read
--     access to this table does not let anyone resume a session — the same
--     reason a password column would hold a hash.
--   * RLS is on with zero policies. Like the waitlist, every read and write
--     goes through the service role in a Server Action. Nothing here is
--     reachable from the public API even though the anon key is published.
--   * Sessions expire. An identity created for one afternoon at a store should
--     not persist indefinitely on a shared or borrowed phone.
--
-- Display names are shown to strangers in a physical room. The constraints
-- below bound length and reject control characters; they are not a moderation
-- system, and none is claimed. See ROADMAP.md.

create table public.player_sessions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz not null,

  display_name text not null,

  -- SHA-256 of the cookie token, lowercase hex. Never the token itself.
  token_hash text not null,

  constraint player_sessions_display_name_is_trimmed
    check (display_name = btrim(display_name)),
  constraint player_sessions_display_name_length
    check (char_length(display_name) between 2 and 24),
  -- Control characters would let a name break the layout it is rendered into,
  -- and are never present in one a person meant to type.
  constraint player_sessions_display_name_is_printable
    check (display_name !~ '[[:cntrl:]]'),
  constraint player_sessions_token_hash_shape
    check (token_hash ~ '^[0-9a-f]{64}$'),
  constraint player_sessions_expires_after_creation
    check (expires_at > created_at)
);

comment on table public.player_sessions is
  'Accountless player identities. Created by scanning into an event; resumed by an httpOnly cookie whose token is stored here only as a hash.';

comment on column public.player_sessions.token_hash is
  'SHA-256 of the session token. The token exists only in the cookie.';

-- Lookup on every request that carries the cookie, so it is the one index
-- that has to be fast. Unique because two sessions must never share a token.
create unique index player_sessions_token_hash_key
  on public.player_sessions (token_hash);

-- Supports purging expired rows without scanning the table.
create index player_sessions_expires_at_idx
  on public.player_sessions (expires_at);

alter table public.player_sessions enable row level security;

/*
 * No policies, deliberately.
 *
 * A guest session has no auth.uid() to key a policy off — that is the whole
 * point of it. Authorisation is therefore possession of the token, which is
 * checked server-side by hashing the cookie and matching this table. Adding a
 * policy here would expose other players' rows to anyone holding the public
 * anon key.
 */

-- Belt and braces: revoke the table-level grants Supabase gives these roles by
-- default, so a policy added by mistake later still exposes nothing.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on public.player_sessions from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on public.player_sessions from authenticated;
  end if;
end
$$;

/*
 * Deleting expired sessions.
 *
 * Expired rows are already ignored on lookup, so this is housekeeping rather
 * than a security control. Run it periodically — pg_cron if the project has
 * it, otherwise by hand:
 *
 *   delete from public.player_sessions where expires_at < now();
 */
