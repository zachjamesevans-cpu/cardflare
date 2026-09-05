-- Search reads its indexes instead of scoring every card.
--
-- `search_cards` was written when the catalogue was One Piece: a few
-- thousand rows, cheap to score one by one. It computed a trigram
-- similarity for every card in the table, ran a sub-select against
-- the aliases for every card in the table, and only then sorted and
-- kept twenty. With Magic, Pokemon, Lorcana, Flesh and Blood and
-- Riftbound loaded the table is over a hundred thousand rows, and the
-- same plan takes half a second of pure CPU per keystroke, before the
-- network. The founder: "takes like 3x longer to find a card now."
--
-- The trigram indexes that would have made this instant have existed
-- since the catalogue was built; nothing used them, because
-- `similarity()` in a select list is not something an index can
-- answer. The `%` operator is: it asks "is the similarity at or above
-- pg_trgm.similarity_threshold", and a GIN trigram index answers it
-- without reading the table. So the search now runs in two steps.
-- First, a handful of index probes gather every card that could
-- possibly score: a number starting with what was typed, a number or
-- name within similarity 0.25 of it, a name or alias containing it.
-- Second, exactly the old scoring runs over those candidates only.
-- The ranking, the tie-break, the 0.25 floor and every filter are
-- unchanged, so the same query returns the same cards in the same
-- order; it just stops looking at the hundred thousand that could
-- never have made the page.
--
-- pg_trgm.similarity_threshold is set on the function itself to the
-- same 0.25 the ranking keeps, so the index and the floor agree. It
-- is a session setting that the function scopes to its own call; it
-- never leaks into the caller's session.
--
-- The one new index: `compact_card_number` had a plain b-tree, which
-- cannot answer "starts with OP01" under a locale-aware collation.
-- `text_pattern_ops` can, so "op01" no longer walks the table either.

begin;

create index if not exists cards_compact_number_pattern_idx
  on public.cards (compact_card_number text_pattern_ops);

create or replace function public.search_cards(
  search_query text,
  result_limit integer default 20,
  filter_set_code text default null,
  filter_card_type text default null,
  filter_color text default null,
  filter_game text default null
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
set pg_trgm.similarity_threshold = 0.25
as $function$
  with params as (
    select
      lower(btrim(coalesce(search_query, ''))) as term,
      -- The same query with punctuation stripped, so "op01024" finds OP01-024.
      regexp_replace(upper(btrim(coalesce(search_query, ''))), '[^A-Z0-9]', '', 'g')
        as compact,
      -- The set filter the way people type it: letters and digits only.
      regexp_replace(upper(coalesce(filter_set_code, '')), '[^A-Z0-9]', '', 'g')
        as set_wanted,
      least(greatest(coalesce(result_limit, 20), 1), 50) as lim
  ),
  -- Every card that could score 0.25 or better, found by index. Each
  -- branch mirrors one arm of the scoring below: the number branches
  -- cover the exact, prefix and similar-number cases, the name
  -- branches cover exact, contains and similar, and the alias branch
  -- covers the alias sub-select. A card the scoring would give 0.25
  -- to is in at least one of them.
  candidates as (
    select c.id
    from public.cards c
    cross join params p
    where p.compact <> ''
      -- "Starts with OP01024", written as a range so the b-tree can
      -- answer it. `like p.compact || '%'` cannot use an index when
      -- the pattern is a parameter, because the planner only turns a
      -- constant pattern into a range. `~>=~` and `~<~` compare
      -- bytewise, which is what text_pattern_ops indexes; the column
      -- is only ever A-Z and 0-9, and '[' is the byte after 'Z', so
      -- everything with the prefix sits in [compact, compact||'[').
      and c.compact_card_number ~>=~ p.compact
      and c.compact_card_number ~<~ (p.compact || '[')
    union
    select c.id
    from public.cards c
    cross join params p
    where p.term <> ''
      and lower(c.canonical_card_number) % p.term
    union
    select c.id
    from public.cards c
    cross join params p
    where p.term <> ''
      and c.normalized_name like '%' || p.term || '%'
    union
    select c.id
    from public.cards c
    cross join params p
    where p.term <> ''
      and c.normalized_name % p.term
    union
    select a.card_id
    from public.card_aliases a
    cross join params p
    where p.term <> ''
      and (a.alias like '%' || p.term || '%' or a.alias % p.term)
  ),
  -- Materialised so the score is computed once per candidate; inlined,
  -- the planner copies the expression into both the floor and the sort.
  scored as materialized (
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
      -- Fetched by primary key, one probe per candidate. Written as a
      -- join, the planner guesses a few thousand candidates and reads
      -- the whole table to hash them instead; an array of ids always
      -- goes through the index, and the array is built once.
      and c.id = any (array(select k.id from candidates k))
      -- The room's game, when the scan said which one. Null is every game.
      and (filter_game is null or c.game = filter_game)
      and (filter_card_type is null or c.card_type = lower(filter_card_type))
      and (filter_color is null or lower(filter_color) = any (c.colors))
      and (
        p.set_wanted = ''
        -- The card's own number carries its set: EB04-007 starts EB04.
        or c.compact_card_number like p.set_wanted || '%'
        -- And a printing's set code counts however the provider wrote
        -- it: "EB-04", "OP15-EB04" and "EB04" all contain EB04 once the
        -- dashes are gone.
        or exists (
          select 1 from public.card_printings cp
          where cp.card_id = c.id
            and replace(upper(coalesce(cp.set_code, '')), '-', '')
                like '%' || p.set_wanted || '%'
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

-- The imports that grew the table were bulk upserts; fresh statistics
-- let the planner see the table it now has rather than the one it
-- remembers.
analyze public.cards;
analyze public.card_printings;
analyze public.card_aliases;

commit;
