-- CardFlare waitlist storage.
--
-- Security model: this table is written only by the Next.js server action using
-- the service-role key, which bypasses RLS. RLS is enabled with no policies for
-- anon/authenticated, so the public PostgREST API can neither read nor write it.

create type public.waitlist_user_type as enum (
  'player',
  'store',
  'tournament_organizer',
  'creator',
  'other'
);

create type public.waitlist_status as enum (
  'active',
  'unsubscribed',
  'bounced'
);

create table public.waitlist_signups (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  first_name text not null,
  email text not null,
  user_type public.waitlist_user_type not null,
  primary_game text,
  city text,
  region text,
  store_name text,
  comment text,
  marketing_consent boolean not null default false,
  source text,
  referral_code text,
  status public.waitlist_status not null default 'active',

  -- Defence in depth: the server normalizes and length-checks input with Zod,
  -- but the database refuses anything malformed regardless of how it arrives.
  constraint waitlist_signups_email_is_normalized check (email = lower(btrim(email))),
  constraint waitlist_signups_email_shape check (email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  constraint waitlist_signups_email_length check (char_length(email) between 3 and 254),
  constraint waitlist_signups_first_name_length check (char_length(btrim(first_name)) between 1 and 80),
  constraint waitlist_signups_primary_game_length check (primary_game is null or char_length(primary_game) <= 80),
  constraint waitlist_signups_city_length check (city is null or char_length(city) <= 80),
  constraint waitlist_signups_region_length check (region is null or char_length(region) <= 80),
  constraint waitlist_signups_store_name_length check (store_name is null or char_length(store_name) <= 120),
  constraint waitlist_signups_comment_length check (comment is null or char_length(comment) <= 500),
  constraint waitlist_signups_referral_code_length check (referral_code is null or char_length(referral_code) <= 64),
  constraint waitlist_signups_source_length check (source is null or char_length(source) <= 120)
);

-- One signup per address. Emails are stored already normalized, so a plain
-- unique index is sufficient and is what the duplicate path relies on (23505).
create unique index waitlist_signups_email_key
  on public.waitlist_signups (email);

create index waitlist_signups_created_at_idx
  on public.waitlist_signups (created_at desc);

comment on table public.waitlist_signups is
  'Pre-launch waitlist signups. Written exclusively by the server action via the service-role key.';

alter table public.waitlist_signups enable row level security;

-- Belt and braces: even if a policy is added by mistake later, the anon and
-- authenticated roles hold no table privileges to exercise it. Guarded by a
-- role check so the migration also applies to a plain PostgreSQL instance,
-- where Supabase's roles do not exist.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on table public.waitlist_signups from anon;
  end if;

  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on table public.waitlist_signups from authenticated;
  end if;
end
$$;
