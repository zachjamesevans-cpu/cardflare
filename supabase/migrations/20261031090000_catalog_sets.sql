-- The catalogue's sets, counted in the database.
--
-- The admin console used to read every printing (15,000 rows, a page
-- of 1,000 at a time, with no order clause) and count set codes in
-- the browser's server. Two things were wrong with that. It took eight
-- seconds, which is why /admin and /admin/cards/sets were the two
-- slowest pages on the site. And a paged read with no order is not a
-- stable read: Postgres is free to hand back the same row on two pages
-- and skip another, so the front page and the sets page disagreed
-- (506 sets and 15,165 cards on one, 470 and 15,093 on the other) from
-- the same table.
--
-- One aggregate answers it in one round trip, deterministically, and
-- carries the game and the set's name so the sets page can say which
-- game each set belongs to instead of guessing from the code's shape.
-- Distinct cards, not printings: a card with an alternate art is one
-- card in its set, because this number is compared against the
-- official set list.

create or replace function public.catalog_sets()
returns table (game text, set_code text, set_name text, cards bigint)
language sql
stable
set search_path = public
as $$
  select
    c.game::text as game,
    p.set_code,
    min(p.set_name) as set_name,
    count(distinct p.card_id) as cards
  from public.card_printings p
  join public.cards c on c.id = p.card_id
  group by c.game, p.set_code
  order by c.game, p.set_code;
$$;

-- The console runs with the service role; nobody else needs it.
revoke all on function public.catalog_sets() from public, anon, authenticated;
grant execute on function public.catalog_sets() to service_role;
