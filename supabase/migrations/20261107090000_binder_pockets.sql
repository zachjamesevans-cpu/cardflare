-- Real pockets, and a short link for every binder.
--
-- The founder: "Adding a card in a specific slot should put that exact
-- card there. Currently, if I for example select the bottom right
-- section to add a card, it defaults to placing it at top left." A
-- card's `position` was an order (unplaced cards sorted first), so a
-- new card always surfaced at the top left. Now it is the POCKET: page
-- 1 holds pockets 0 to 8, page 2 holds 9 to 17, and a gap stays a gap,
-- the way a real binder keeps a slot open for a card you are chasing.
--
-- And the share link: cardflare.gg/b/<share_code> rather than a
-- 36-character id. The id keeps working.
--
-- Safe to run again.

begin;

-- 1. Every card gets a pocket, in the order the binder shows today
--    (unplaced first, newest first; then placed, by position).
with ordered as (
  select id,
         row_number() over (
           partition by binder_id
           order by (position is not null), 
                    case when position is null then created_at end desc,
                    position,
                    created_at
         ) - 1 as pocket
    from public.binder_cards
)
update public.binder_cards c
   set position = ordered.pocket
  from ordered
 where c.id = ordered.id
   and exists (
     select 1 from public.binder_cards n
      where n.binder_id = c.binder_id and n.position is null
   );

-- Binders with no unplaced card can still hold duplicate positions from
-- an interrupted reorder; renumber those too, keeping their order.
with dupes as (
  select binder_id
    from public.binder_cards
   group by binder_id, position
  having count(*) > 1
),
ordered as (
  select c.id,
         row_number() over (partition by c.binder_id order by c.position, c.created_at) - 1
           as pocket
    from public.binder_cards c
   where c.binder_id in (select binder_id from dupes)
)
update public.binder_cards c
   set position = ordered.pocket
  from ordered
 where c.id = ordered.id;

-- One card per pocket. Deferred, so a shift that moves a run of cards
-- along by one is checked once, at the end, not card by card.
alter table public.binder_cards drop constraint if exists binder_cards_one_per_pocket;
alter table public.binder_cards
  add constraint binder_cards_one_per_pocket
  unique (binder_id, position) deferrable initially deferred;

alter table public.binder_cards drop constraint if exists binder_cards_pocket_range;
alter table public.binder_cards
  add constraint binder_cards_pocket_range check (position is null or position between 0 and 899);

comment on column public.binder_cards.position is
  'The pocket: page 1 is 0 to 8, page 2 is 9 to 17. Gaps are allowed and kept.';

-- 2. Put a card in a pocket. An empty pocket simply takes it; a full one
--    slides the run of cards from there along to the next gap.
create or replace function public.binder_place_card(
  p_binder uuid,
  p_entry uuid,
  p_pocket integer
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_gap integer;
begin
  if p_pocket < 0 or p_pocket > 899 then
    raise exception 'pocket out of range';
  end if;

  perform 1 from public.binder_cards
   where id = p_entry and binder_id = p_binder
   for update;
  if not found then
    raise exception 'not this binder''s card';
  end if;

  if exists (
    select 1 from public.binder_cards
     where binder_id = p_binder and position = p_pocket and id <> p_entry
  ) then
    select min(g) into v_gap
      from generate_series(p_pocket, 899) as g
     where not exists (
       select 1 from public.binder_cards
        where binder_id = p_binder and position = g and id <> p_entry
     );
    if v_gap is null then
      raise exception 'binder is full';
    end if;

    update public.binder_cards
       set position = position + 1
     where binder_id = p_binder
       and id <> p_entry
       and position >= p_pocket
       and position < v_gap;
  end if;

  update public.binder_cards
     set position = p_pocket
   where id = p_entry and binder_id = p_binder;
end;
$$;

-- 3. The whole order at once, for the builds that still send a list:
--    pockets 0, 1, 2... in the order given, the rest after them.
create or replace function public.binder_save_order(
  p_binder uuid,
  p_ids uuid[]
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  with given as (
    select id, ord - 1 as pocket
      from unnest(p_ids) with ordinality as t(id, ord)
  ),
  rest as (
    select c.id,
           (select count(*) from given)
             + row_number() over (order by c.position, c.created_at) - 1 as pocket
      from public.binder_cards c
     where c.binder_id = p_binder
       and c.id not in (select id from given)
  ),
  everything as (
    select id, pocket from given
    union all
    select id, pocket from rest
  )
  update public.binder_cards c
     set position = everything.pocket
    from everything
   where c.id = everything.id
     and c.binder_id = p_binder;
end;
$$;

revoke all on function public.binder_place_card(uuid, uuid, integer) from public;
revoke all on function public.binder_save_order(uuid, uuid[]) from public;

-- 4. The short link.
alter table public.binders add column if not exists share_code text;

update public.binders
   set share_code = substr(md5(random()::text || id::text), 1, 8)
 where share_code is null;

create unique index if not exists binders_share_code_idx on public.binders (share_code);

comment on column public.binders.share_code is
  'The short link: cardflare.gg/b/<share_code>. Made with the binder; the id link still works.';

commit;
