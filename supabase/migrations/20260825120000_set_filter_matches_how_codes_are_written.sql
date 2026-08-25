-- "eb04 zoro" found nothing, and the founder typed it exactly the way a
-- player would.
--
-- The query parser correctly lifts "eb04" out as a set filter — and the
-- filter then compared it with `=` against set codes as the providers
-- write them, which is never how a player types them. The catalog holds
-- "EB-04" (the sync's shape), "OP15-EB04" (a provider's composite), and
-- "OP17" (an import's), and a bare "EB04" equals none of those.
--
-- Two changes, both in the set-filter clause and nothing else:
--
--   1. Set codes compare with the dashes stripped from BOTH sides, and
--      by containment, so "EB04" finds "EB-04" and "OP15-EB04" alike.
--   2. The card's own number answers too: every EB04 card is numbered
--      EB04-something, so `compact_card_number like 'EB04%'` finds the
--      set even where a printing's set_code is missing or strange.
--
-- Re-runnable: `create or replace` with an unchanged signature.

create or replace function public.search_cards(
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
      -- The set filter the way people type it: letters and digits only.
      regexp_replace(upper(coalesce(filter_set_code, '')), '[^A-Z0-9]', '', 'g')
        as set_wanted,
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
