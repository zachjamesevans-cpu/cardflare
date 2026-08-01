-- One Piece card catalog, rebuilt around a provider-neutral model.
--
-- Replaces the Milestone 5 card tables. Those were never populated — no import
-- has ever run — so this drops and recreates rather than migrating in place.
-- The guard below refuses to run if that assumption is wrong, because silently
-- discarding a card pool someone had loaded would be far worse than an error.
--
-- What changed and why:
--   * `exact_name` and `normalized_name` are separate columns. The provider's
--     display name, punctuation and capitalisation included, is never
--     overwritten by the searchable form.
--   * Provider provenance (`provider_key`, `provider_external_id`,
--     `raw_metadata`) is stored on every row, so a mapping mistake can be
--     diagnosed against what actually arrived rather than guessed at.
--   * Printing variant flags are **nullable**. Null means "the provider did not
--     tell us", which is different from false. Defaulting them to false would
--     record a guess as a fact.
--   * Effect and trigger text are stored. This reverses an earlier decision;
--     the product owner asked for them, and they are needed to tell two
--     similarly-named cards apart in a search result.

/*
 * The check and the drops are one statement on purpose.
 *
 * A `raise` followed by separate `drop` statements only protects a populated
 * catalog if the whole script runs in one transaction — true for the Supabase
 * editor and the CLI, but not something a destructive migration should depend
 * on. A DO block is atomic by itself, so the raise below makes the drops
 * unreachable rather than merely rolled back.
 */
do $$
begin
  if to_regclass('public.cards') is not null
     and exists (select 1 from public.cards limit 1) then
    raise exception
      'public.cards has rows. This migration assumes an empty catalog; migrate the data deliberately instead.';
  end if;

  drop table if exists public.card_aliases cascade;
  drop table if exists public.card_printings cascade;
  drop table if exists public.cards cascade;
  drop function if exists public.search_cards(text, integer);
  drop function if exists public.search_cards(text, integer, text, text, text);
  drop type if exists public.card_category cascade;
end
$$;

-- Re-runnable: these are new in this migration, so an interrupted first run
-- leaves them behind.
drop type if exists public.sync_status cascade;
drop type if exists public.sync_mode cascade;
drop table if exists public.card_sync_failures cascade;
drop table if exists public.card_sync_runs cascade;

create extension if not exists pg_trgm;

-- ---------------------------------------------------------------------------
-- Gameplay identity
-- ---------------------------------------------------------------------------

create table public.cards (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  game public.game not null default 'one_piece',

  /*
   * The printed identifier, e.g. OP01-024. This is the gameplay identity: a
   * player who needs OP01-024 is happy with any printing of it.
   */
  canonical_card_number text not null,
  /* Digits and letters only, for searching a number typed without the dash. */
  compact_card_number text not null,

  /* The provider's display name, byte for byte. Never rewritten. */
  exact_name text not null,
  /* Lowercased, punctuation stripped, whitespace collapsed. For matching only. */
  normalized_name text not null,

  /*
   * Free text rather than an enum. The provider's vocabulary is not known in
   * advance, and an enum would reject a card type rather than record it.
   * Normalised to lowercase by the adapter so filtering is predictable.
   */
  card_type text,
  /* One Piece has multicolour cards, so this is a list, not a single value. */
  colors text[] not null default '{}',
  traits text[] not null default '{}',

  cost integer,
  power integer,
  counter integer,
  life integer,
  rarity text,

  effect_text text,
  trigger_text text,

  /* Provenance. Which provider produced this row, and what it looked like. */
  provider_key text not null,
  provider_external_id text,
  raw_metadata jsonb,
  /* The provider's own last-modified value, when it supplies one. */
  provider_updated_at timestamptz,

  constraint cards_number_is_normalized
    check (canonical_card_number = upper(btrim(canonical_card_number))),
  constraint cards_number_length
    check (char_length(canonical_card_number) between 2 and 32),
  constraint cards_compact_number_shape
    check (compact_card_number ~ '^[A-Z0-9]+$'),
  constraint cards_exact_name_present
    check (char_length(btrim(exact_name)) between 1 and 200),
  constraint cards_normalized_name_present
    check (char_length(normalized_name) between 1 and 200),
  constraint cards_numbers_are_sane check (
    (cost is null or cost between 0 and 99)
    and (power is null or power between -99999 and 99999)
    and (counter is null or counter between 0 and 99999)
    and (life is null or life between 0 and 99)
  )
);

comment on table public.cards is
  'Gameplay identity of a card. One row per canonical card number per game, regardless of how many printings exist.';
comment on column public.cards.exact_name is
  'The provider''s display name verbatim. Never replaced by normalized_name.';
comment on column public.cards.raw_metadata is
  'The provider record this row was built from, kept so a mapping error is diagnosable.';

-- The gameplay identity. Two printings of OP01-024 share one row.
create unique index cards_game_number_key
  on public.cards (game, canonical_card_number);

create index cards_compact_number_idx on public.cards (compact_card_number);
create index cards_normalized_name_idx on public.cards (normalized_name);
create index cards_card_type_idx on public.cards (card_type);
create index cards_provider_idx on public.cards (provider_key, provider_external_id);
create index cards_colors_idx on public.cards using gin (colors);
create index cards_traits_idx on public.cards using gin (traits);

-- Trigram indexes are what let a misspelling still find the card.
create index cards_normalized_name_trgm_idx
  on public.cards using gin (normalized_name gin_trgm_ops);
create index cards_number_trgm_idx
  on public.cards using gin (lower(canonical_card_number) gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- Physical printings
-- ---------------------------------------------------------------------------

create table public.card_printings (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  card_id uuid not null references public.cards (id) on delete cascade,

  provider_key text not null,
  /* The provider's identifier for this specific printing. */
  provider_external_id text not null,

  set_code text,
  set_name text,
  /* What to show a player, e.g. "OP01 · Alternate Art". */
  printing_label text,

  /*
   * Classification is explicitly three-valued.
   *
   * Null means the provider did not say. That is not the same as false, and
   * recording it as false would turn an absence of information into a claim.
   * `variant_type` carries the provider's own wording when there is one.
   */
  variant_type text,
  is_alternate_art boolean,
  is_promo boolean,
  is_parallel boolean,
  is_reprint boolean,

  language text not null default 'en',

  /*
   * Only ever a URL the provider returned. Never constructed from a guessed
   * pattern, never rewritten, never downloaded. Rendered only when the image
   * feature flag is on.
   */
  image_url text,

  raw_metadata jsonb,
  provider_updated_at timestamptz,

  constraint card_printings_set_code_is_normalized
    check (set_code is null or set_code = upper(btrim(set_code))),
  constraint card_printings_image_is_https
    check (image_url is null or image_url like 'https://%'),
  constraint card_printings_language_shape
    check (language ~ '^[a-z]{2}(-[A-Z]{2})?$')
);

comment on table public.card_printings is
  'A physical printing of a card. Variant flags are nullable: null means the provider did not classify it, which is not the same as false.';
comment on column public.card_printings.image_url is
  'Provider-supplied only. Never inferred, never rewritten, never downloaded. Display is gated by NEXT_PUBLIC_ENABLE_CARD_IMAGES.';

/*
 * One row per provider record. This is what makes re-running a sync an update
 * rather than a duplication, while still allowing a card to have as many
 * genuinely distinct printings as the provider reports.
 */
create unique index card_printings_provider_key
  on public.card_printings (provider_key, provider_external_id);

create index card_printings_card_id_idx on public.card_printings (card_id);
create index card_printings_set_code_idx on public.card_printings (set_code);

-- ---------------------------------------------------------------------------
-- Community aliases
-- ---------------------------------------------------------------------------

/*
 * Kept from the previous schema and deliberately separate from `exact_name`.
 * A nickname must never overwrite an official name; it only adds another way
 * to find the card.
 */
create table public.card_aliases (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.cards (id) on delete cascade,
  alias text not null,
  /* Where the alias came from, so provider data and community input differ. */
  source text not null default 'community',

  constraint card_aliases_is_normalized check (alias = lower(btrim(alias))),
  constraint card_aliases_length check (char_length(alias) between 1 and 80)
);

create unique index card_aliases_unique_idx on public.card_aliases (card_id, alias);
create index card_aliases_trgm_idx
  on public.card_aliases using gin (alias gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- Sync bookkeeping
-- ---------------------------------------------------------------------------

create type public.sync_status as enum ('running', 'succeeded', 'failed');
create type public.sync_mode as enum ('sample', 'full');

/*
 * One row per sync attempt.
 *
 * Exists so "when did the catalog last update" and "did the last run finish"
 * are answerable without reading logs, and so an interrupted run is visible
 * rather than silently half-applied.
 */
create table public.card_sync_runs (
  id uuid primary key default gen_random_uuid(),
  provider_key text not null,
  mode public.sync_mode not null,
  status public.sync_status not null default 'running',

  started_at timestamptz not null default now(),
  finished_at timestamptz,

  records_seen integer not null default 0,
  cards_upserted integer not null default 0,
  printings_upserted integer not null default 0,
  records_failed integer not null default 0,

  /* Short human-readable outcome. Never a secret, never a full response body. */
  notes text
);

create index card_sync_runs_provider_started_idx
  on public.card_sync_runs (provider_key, started_at desc);

/*
 * Records the sync could not use.
 *
 * A card that fails validation is skipped, not coerced — but it is recorded
 * here with the payload, so a provider changing a field is a query rather than
 * an investigation.
 */
create table public.card_sync_failures (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.card_sync_runs (id) on delete cascade,
  provider_external_id text,
  reason text not null,
  raw_record jsonb,
  created_at timestamptz not null default now()
);

create index card_sync_failures_run_idx on public.card_sync_failures (run_id);

-- ---------------------------------------------------------------------------
-- Access
-- ---------------------------------------------------------------------------

alter table public.cards enable row level security;
alter table public.card_printings enable row level security;
alter table public.card_aliases enable row level security;
alter table public.card_sync_runs enable row level security;
alter table public.card_sync_failures enable row level security;

/*
 * No policies on any of them.
 *
 * Card data is public reference material, so sealing it is not secrecy — it is
 * that the people searching are guest players with no Supabase identity at
 * all. Their queries go through a Server Action using the service role, which
 * is also where search is rate limited. Opening a PostgREST endpoint would add
 * a second, unthrottled way in for no benefit. Sync tables are operational and
 * have no business being reachable from a browser at all.
 */
do $$
declare
  t text;
begin
  foreach t in array array[
    'cards', 'card_printings', 'card_aliases',
    'card_sync_runs', 'card_sync_failures'
  ] loop
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('revoke all on public.%I from anon', t);
    end if;
    if exists (select 1 from pg_roles where rolname = 'authenticated') then
      execute format('revoke all on public.%I from authenticated', t);
    end if;
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- Search
-- ---------------------------------------------------------------------------

/*
 * Ranked card search over the local catalog.
 *
 * A SQL function rather than a PostgREST query because the ranking is the
 * feature: trigram `similarity()` cannot be expressed through the REST filter
 * syntax, and without it "monkey d luff" returns nothing.
 *
 * Searches, in descending confidence: the card number (with or without its
 * dash), the exact name, the normalized name, community aliases, then fuzzy
 * similarity. Set code, card type and colour are filters rather than ranked
 * terms — they narrow a search, they do not identify a card.
 *
 * SECURITY INVOKER. The tables are sealed and this is called with the service
 * role from a Server Action; a definer function would re-open what the revokes
 * above closed.
 */
create function public.search_cards(
  search_query text,
  result_limit integer default 20,
  filter_set_code text default null,
  filter_card_type text default null,
  filter_color text default null
)
returns table (
  id uuid,
  canonical_card_number text,
  exact_name text,
  card_type text,
  colors text[],
  traits text[],
  cost integer,
  power integer,
  counter integer,
  life integer,
  rarity text,
  effect_text text,
  trigger_text text,
  score real
)
language sql
stable
set search_path = public, pg_temp
as $function$
  with params as (
    select
      lower(btrim(coalesce(search_query, ''))) as term,
      -- The same query with punctuation stripped, so "op01024" finds OP01-024.
      regexp_replace(upper(btrim(coalesce(search_query, ''))), '[^A-Z0-9]', '', 'g')
        as compact,
      least(greatest(coalesce(result_limit, 20), 1), 50) as lim
  ),
  scored as (
    select
      c.id, c.canonical_card_number, c.exact_name, c.card_type, c.colors,
      c.traits, c.cost, c.power, c.counter, c.life, c.rarity,
      c.effect_text, c.trigger_text,
      greatest(
        case
          when lower(c.canonical_card_number) = p.term then 1.0
          when p.compact <> '' and c.compact_card_number = p.compact then 1.0
          when p.compact <> '' and c.compact_card_number like p.compact || '%' then 0.95
          else similarity(lower(c.canonical_card_number), p.term)
        end,
        case
          when lower(c.exact_name) = p.term then 1.0
          when c.normalized_name = p.term then 0.99
          when c.normalized_name like '%' || p.term || '%' then 0.90
          else similarity(c.normalized_name, p.term)
        end,
        coalesce((
          select max(
            case
              when a.alias = p.term then 0.98
              when a.alias like '%' || p.term || '%' then 0.88
              else similarity(a.alias, p.term)
            end
          )
          from public.card_aliases a
          where a.card_id = c.id
        ), 0)
      )::real as score
    from public.cards c
    cross join params p
    where p.term <> ''
      and (filter_card_type is null or c.card_type = lower(filter_card_type))
      and (filter_color is null or lower(filter_color) = any (c.colors))
      and (
        filter_set_code is null
        or exists (
          select 1 from public.card_printings cp
          where cp.card_id = c.id and cp.set_code = upper(filter_set_code)
        )
      )
  )
  select
    s.id, s.canonical_card_number, s.exact_name, s.card_type, s.colors, s.traits,
    s.cost, s.power, s.counter, s.life, s.rarity, s.effect_text, s.trigger_text,
    s.score
  from scored s
  -- Below this, results are noise rather than near misses.
  where s.score >= 0.25
  order by s.score desc, s.canonical_card_number asc
  limit (select lim from params);
$function$;

revoke all on function
  public.search_cards(text, integer, text, text, text) from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on function
      public.search_cards(text, integer, text, text, text) from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on function
      public.search_cards(text, integer, text, text, text) from authenticated;
  end if;
end
$$;
