-- Card reference data.
--
-- Two deliberate absences, both worth stating plainly:
--
--   * No card effect text. CardFlare coordinates a meeting between two people
--     who each know what their cards do; rules text is the most clearly
--     creative part of a card and the least useful part for finding one.
--   * No card images. Identity here is a name, a code and a printing label,
--     which is enough to find a card across a table. `image_url` exists on a
--     printing so a provider that is permitted to supply one can, and stays
--     null until that is settled. See PRODUCT.md and ROADMAP.md.
--
-- Identity versus printing is the modelling decision that matters. A `card` is
-- the game entity a player means when they say "I need OP01-001". A
-- `card_printing` is a physical object: base, alternate art, a promo. Someone
-- who needs the card is nearly always happy with any printing of it, so
-- matching keys off the card and printing is a preference expressed on top.

create extension if not exists pg_trgm;

create type public.card_category as enum (
  'leader',
  'character',
  'event',
  'stage',
  'don'
);

create table public.cards (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  game public.game not null default 'one_piece',
  -- The printed identifier, e.g. OP01-001. Uppercase and trimmed.
  code text not null,
  name text not null,
  category public.card_category not null,

  -- Free-form rather than an enum: colour sets differ between games, and this
  -- column has to survive the second game without a migration.
  colors text[] not null default '{}',
  types text[] not null default '{}',

  -- Nullable because they do not apply to every category. A Leader has life
  -- and no cost; an Event has cost and no power.
  cost integer,
  power integer,
  counter integer,
  life integer,
  attribute text,

  constraint cards_code_is_normalized check (code = upper(btrim(code))),
  constraint cards_code_length check (char_length(code) between 2 and 32),
  constraint cards_name_is_trimmed check (name = btrim(name)),
  constraint cards_name_length check (char_length(name) between 1 and 120),
  constraint cards_numbers_are_sane check (
    (cost is null or cost between 0 and 99)
    and (power is null or power between -9999 and 99999)
    and (counter is null or counter between 0 and 9999)
    and (life is null or life between 0 and 99)
  )
);

comment on table public.cards is
  'Card identity: what a player means by "OP01-001". Deliberately holds no effect text and no artwork.';

create unique index cards_game_code_key on public.cards (game, code);

-- Search is a name typed on a phone at a noisy counter, so it has to tolerate
-- a misspelling. Trigram indexes make `similarity()` and ILIKE both usable.
create index cards_name_trgm_idx on public.cards using gin (lower(name) gin_trgm_ops);
create index cards_code_trgm_idx on public.cards using gin (lower(code) gin_trgm_ops);

create table public.card_printings (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.cards (id) on delete cascade,

  set_code text not null,
  rarity text,
  -- "Alternate Art", "Manga Rare", "Championship Promo". Null means the base
  -- printing, which keeps the common case out of the data.
  variant text,
  -- Stays null until a provider is permitted to supply artwork.
  image_url text,

  constraint card_printings_set_code_is_normalized
    check (set_code = upper(btrim(set_code))),
  constraint card_printings_set_code_length
    check (char_length(set_code) between 1 and 32),
  constraint card_printings_variant_length
    check (variant is null or char_length(variant) between 1 and 60),
  constraint card_printings_image_is_https
    check (image_url is null or image_url like 'https://%')
);

comment on column public.card_printings.image_url is
  'Null unless a provider is licensed to supply artwork. See ROADMAP.md.';

-- One row per physical printing. `coalesce` because null never equals null, so
-- a plain unique constraint would allow unlimited duplicate base printings.
create unique index card_printings_unique_idx
  on public.card_printings (card_id, set_code, coalesce(variant, ''));

create index card_printings_card_id_idx on public.card_printings (card_id);

/*
 * What players actually call a card.
 *
 * Nobody at an event asks for "Monkey D. Luffy OP01-001"; they ask for "Red
 * Luffy" or just the code. Aliases are a separate table rather than a column
 * so one card can carry many, and so a community-contributed nickname can be
 * distinguished from a printed one later.
 */
create table public.card_aliases (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.cards (id) on delete cascade,
  alias text not null,

  constraint card_aliases_is_normalized check (alias = lower(btrim(alias))),
  constraint card_aliases_length check (char_length(alias) between 1 and 80)
);

create unique index card_aliases_unique_idx on public.card_aliases (card_id, alias);
create index card_aliases_trgm_idx
  on public.card_aliases using gin (alias gin_trgm_ops);

alter table public.cards enable row level security;
alter table public.card_printings enable row level security;
alter table public.card_aliases enable row level security;

/*
 * No policies on any of the three.
 *
 * Card data is public reference material, so sealing it is not about secrecy —
 * it is that the people searching are guest players with no Supabase identity
 * at all. Their queries go through a Server Action using the service role,
 * which is also where search gets rate limited. Opening a PostgREST endpoint
 * would add a second, unthrottled way in for no benefit.
 */
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on public.cards, public.card_printings, public.card_aliases from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on public.cards, public.card_printings, public.card_aliases
      from authenticated;
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- Search
-- ---------------------------------------------------------------------------

/*
 * Ranked card search.
 *
 * A SQL function rather than a PostgREST query because the ranking is the
 * feature: `similarity()` cannot be expressed through the REST filter syntax,
 * and without it "monkey d luff" returns nothing. Someone typing one-handed at
 * a noisy counter will misspell the card they want.
 *
 * Scoring, highest wins:
 *   exact code          1.00   — "op01-001" means one specific card
 *   exact name          1.00
 *   exact alias         0.98   — "red luffy" is unambiguous to a player
 *   code prefix         0.95   — "op01-0" while still typing
 *   name contains       0.90
 *   alias contains      0.88
 *   otherwise           trigram similarity, for misspellings
 *
 * SECURITY INVOKER: the tables are sealed and this is called with the service
 * role from a Server Action, which is also where the rate limit lives. A
 * definer function here would quietly re-open what the revokes above closed.
 *
 * Scans every card to score it. At a few thousand cards per game that is well
 * under a millisecond; if the card pool ever reaches the point where it is
 * not, the fix is a prefilter on the trigram indexes, not a rewrite.
 */
create function public.search_cards(
  search_query text,
  result_limit integer default 20
)
returns table (
  id uuid,
  code text,
  name text,
  category public.card_category,
  colors text[],
  types text[],
  cost integer,
  power integer,
  counter integer,
  life integer,
  attribute text,
  score real
)
language sql
stable
set search_path = public, pg_temp
as $$
  with params as (
    select
      lower(btrim(coalesce(search_query, ''))) as term,
      least(greatest(coalesce(result_limit, 20), 1), 50) as lim
  ),
  scored as (
    select
      c.id, c.code, c.name, c.category, c.colors, c.types,
      c.cost, c.power, c.counter, c.life, c.attribute,
      greatest(
        case
          when lower(c.code) = p.term then 1.0
          when lower(c.code) like p.term || '%' then 0.95
          else similarity(lower(c.code), p.term)
        end,
        case
          when lower(c.name) = p.term then 1.0
          when lower(c.name) like '%' || p.term || '%' then 0.90
          else similarity(lower(c.name), p.term)
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
  )
  select
    s.id, s.code, s.name, s.category, s.colors, s.types,
    s.cost, s.power, s.counter, s.life, s.attribute, s.score
  from scored s
  -- Below this, results are noise rather than near misses.
  where s.score >= 0.25
  order by s.score desc, s.code asc
  limit (select lim from params);
$$;

revoke all on function public.search_cards(text, integer) from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on function public.search_cards(text, integer) from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on function public.search_cards(text, integer) from authenticated;
  end if;
end
$$;
