-- A store can exist in CardFlare before it is a CardFlare customer.
--
-- Today a `stores` row is a customer: somebody signed up, got a counter
-- code, and started running rooms. That is why the map of CardFlare is
-- empty in every city nobody has sold into yet, and why a player opening
-- the app in a new town is told, accurately and uselessly, that nothing
-- is happening anywhere near them.
--
-- The founder's direction: "I do NOT want the CardFlare store experience
-- to look empty just because an LGS has not personally signed up." So a
-- shop can be listed, unclaimed, from a places provider - and later claim
-- itself, be verified, and buy Ultra.
--
-- ONE TABLE, not two. An unclaimed listing and a paying Ultra store are
-- the same business at two points in one funnel: a second directory table
-- would mean every read joins both forever, and the moment a store claims
-- itself somebody has to move a row between them and re-point every
-- foreign key that pointed at it. So this widens `stores`, and the new
-- columns all default to what an existing customer already is.
--
-- VERIFIED AND ULTRA ARE SEPARATE COLUMNS, deliberately, and no code may
-- infer one from the other. `verified_at` is trust - CardFlare has
-- confirmed this profile is controlled by the listed business - and it is
-- never for sale. `tier` is the commercial product. A store can be
-- unclaimed, verified, or verified and Ultra, and "we checked who you
-- are" must never be purchasable.
--
-- No coordinates existed anywhere in this schema before now. Distance is
-- computed server-side from these two columns with a bounding box and
-- haversine; precise latitude and longitude never leave the server.

begin;

/* -------------------------------------------------------------------------- */
/* 1. Where a store is, and what it is                                        */
/* -------------------------------------------------------------------------- */

alter table public.stores
  add column if not exists address_line text,
  add column if not exists postal_code text,
  add column if not exists country text,
  /* Nullable on purpose: an existing customer has never been asked for a
     coordinate, and a listing with no location is still a listing. */
  add column if not exists latitude double precision,
  add column if not exists longitude double precision,
  add column if not exists phone text,
  add column if not exists website text;

/*
 * Where the store sits in the funnel.
 *
 * `claimed` is the state an existing customer is already in, so that is
 * the default and every row that exists today is correct without being
 * touched.
 */
do $$
begin
  if not exists (select 1 from pg_type where typname = 'store_claim_status') then
    create type public.store_claim_status as enum ('unclaimed', 'pending', 'claimed');
  end if;
end
$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'store_tier') then
    create type public.store_tier as enum ('free', 'ultra');
  end if;
end
$$;

/*
 * Whether players can see it at all.
 *
 * An imported candidate is a `draft` until an admin publishes it, which
 * is what keeps "nothing is published without CardFlare admin approval"
 * true in the database rather than only in the console.
 */
do $$
begin
  if not exists (select 1 from pg_type where typname = 'store_listing_state') then
    create type public.store_listing_state as enum ('draft', 'published');
  end if;
end
$$;

alter table public.stores
  add column if not exists claim_status public.store_claim_status
    not null default 'claimed',
  add column if not exists tier public.store_tier not null default 'free',
  add column if not exists listing_state public.store_listing_state
    not null default 'published',
  /* Trust, and only an admin writes it. Null means not verified; a
     timestamp is when CardFlare confirmed it, which is worth keeping
     because "verified when" is the first question of any dispute. */
  add column if not exists verified_at timestamptz,
  add column if not exists verified_by uuid references auth.users (id);

/* The box a nearby search prefilters on, before haversine sorts it. */
create index if not exists stores_coordinates_idx
  on public.stores (latitude, longitude)
  where latitude is not null and longitude is not null;

create index if not exists stores_listing_state_idx
  on public.stores (listing_state, claim_status);

/* -------------------------------------------------------------------------- */
/* 2. Where a record came from                                                */
/* -------------------------------------------------------------------------- */

/*
 * Provenance, kept forever and never shown to a player.
 *
 * "I should never look at a CardFlare store six months later and wonder
 * where its information came from." One row per provider record rather
 * than columns on the store, so a shop re-found in a later Overture
 * release gains a second row instead of overwriting the first - which is
 * the only way to answer "what did we know, and when".
 *
 * `license` is stored as text per row because Overture Places is not one
 * licence: it is a mix of CDLA Permissive 2.0, Apache 2.0 and CC0 1.0
 * depending on which source a place came from, and the attribution that
 * has to travel with a record depends on which.
 */
create table if not exists public.store_sources (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores (id) on delete cascade,
  provider text not null,
  provider_place_id text not null,
  license text,
  attribution text,
  imported_at timestamptz not null default now(),
  imported_by uuid references auth.users (id),
  last_verified_at timestamptz,
  last_synced_at timestamptz,
  unique (provider, provider_place_id)
);

create index if not exists store_sources_store_idx
  on public.store_sources (store_id);

/* -------------------------------------------------------------------------- */
/* 3. Claiming a listing                                                      */
/* -------------------------------------------------------------------------- */

do $$
begin
  if not exists (select 1 from pg_type where typname = 'store_claim_state') then
    create type public.store_claim_state as enum (
      'pending',
      'approved',
      'rejected',
      'more-info'
    );
  end if;
end
$$;

/*
 * A request to own a listing, and the queue an admin works through.
 *
 * Deliberately not self-service. Approving one hands somebody control of
 * a business's public profile, and the first version of that decision is
 * a human reading an email address and saying yes.
 */
create table if not exists public.store_claims (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  store_id uuid not null references public.stores (id) on delete cascade,
  claimant_name text not null,
  claimant_email text not null,
  claimant_role text,
  business_email text,
  notes text,
  state public.store_claim_state not null default 'pending',
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users (id),
  review_note text
);

create index if not exists store_claims_queue_idx
  on public.store_claims (state, created_at desc);

/* -------------------------------------------------------------------------- */
/* 4. Candidates an admin has already said no to                              */
/* -------------------------------------------------------------------------- */

/*
 * So junk does not come back every search.
 *
 * A places provider will keep returning the same Walmart for the same
 * bounding box forever. Remembering the GERS id - which Overture keeps
 * stable across releases - is what makes a second search of the same
 * metro shorter than the first instead of identical to it.
 */
create table if not exists public.store_candidate_rejections (
  provider text not null,
  provider_place_id text not null,
  rejected_at timestamptz not null default now(),
  rejected_by uuid references auth.users (id),
  reason text,
  primary key (provider, provider_place_id)
);

/* -------------------------------------------------------------------------- */
/* 5. Nobody reaches any of this without the service role                     */
/* -------------------------------------------------------------------------- */

/*
 * Same posture as every other table here: a player on the Feed may have
 * no auth.uid() at all, so authorisation is checked server-side and the
 * read goes through the service role. It also settles the rule that
 * matters most on these three - a client must never be able to write
 * `verified_at`, `tier`, or a provenance row.
 */
alter table public.store_sources enable row level security;
alter table public.store_claims enable row level security;
alter table public.store_candidate_rejections enable row level security;

revoke all on public.store_sources from anon;
revoke all on public.store_sources from authenticated;
revoke all on public.store_claims from anon;
revoke all on public.store_claims from authenticated;
revoke all on public.store_candidate_rejections from anon;
revoke all on public.store_candidate_rejections from authenticated;

commit;
