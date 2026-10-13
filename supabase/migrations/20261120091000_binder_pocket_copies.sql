-- Every pocket its own card, even when two pockets hold the same card.
--
-- The founder (2026-10-13): "CardFlare's primary goal is to recreate a
-- physical binder exactly, so two identical cards in different physical
-- pockets must appear in two separate digital pockets ... Do not merge
-- identical cards into a single pocket", "while preserving existing trade
-- inventory quantities", and "Existing user binders remain intact after
-- any database migrations."
--
-- Until now a binder kept one row per card and printing (a unique index),
-- so a second copy only counted the first pocket up. This lets a binder
-- hold the same card and printing in as many rows, each in its own pocket.
--
-- Nothing existing is rewritten: no row is split, moved, merged or
-- deleted, and every quantity stays as it is. A pocket's quantity keeps
-- its meaning (copies stacked in that one pocket); the Have list counts a
-- binder's copies across all its pockets (src/lib/binder/binder.ts).
--
-- 1. The one-row-per-printing index goes; a plain index of the same
--    columns keeps the lookups fast.
-- 2. binder_card_adjust (logged trades: copies given and got) works over
--    every pocket holding the card: copies are added to the first pocket's
--    stack, and taken from the last pocket first, a pocket leaving the
--    binder only when it reaches zero.

begin;

-- 1 -------------------------------------------------------------------------

drop index if exists public.binder_cards_one_per_printing;

create index if not exists binder_cards_card_idx
  on public.binder_cards (binder_id, card_id, printing_id);

comment on table public.binder_cards is
  'The cards in a custom binder, one row per pocket. The same card and printing may fill several pockets; quantity is the copies stacked in that one pocket.';

-- 2 -------------------------------------------------------------------------

create or replace function public.binder_card_adjust(
  p_binder uuid,
  p_card uuid,
  p_printing uuid,
  p_delta integer
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.binder_cards%rowtype;
  v_left integer;
  v_take integer;
  v_pocket integer;
  v_next integer;
begin
  if p_delta is null or p_delta = 0 then
    return 0;
  end if;

  -- One change at a time per binder: the pockets, the stacks and the cap hold.
  perform 1 from public.binders where id = p_binder for update;

  if p_delta < 0 then
    v_left := -p_delta;
    for v_row in
      select * from public.binder_cards
       where binder_id = p_binder
         and card_id = p_card
         and printing_id is not distinct from p_printing
       order by position desc nulls first, created_at desc
    loop
      exit when v_left = 0;
      v_take := least(v_left, v_row.quantity);
      if v_take = v_row.quantity then
        delete from public.binder_cards where id = v_row.id;
      else
        update public.binder_cards set quantity = quantity - v_take where id = v_row.id;
      end if;
      v_left := v_left - v_take;
    end loop;
    return -((-p_delta) - v_left);
  end if;

  select * into v_row
    from public.binder_cards
   where binder_id = p_binder
     and card_id = p_card
     and printing_id is not distinct from p_printing
   order by position nulls last, created_at
   limit 1;

  if found then
    v_next := least(99, v_row.quantity + p_delta);
    update public.binder_cards set quantity = v_next where id = v_row.id;
    return v_next - v_row.quantity;
  end if;

  if (select count(*) from public.binder_cards where binder_id = p_binder) >= 200 then
    return 0;
  end if;

  select min(g) into v_pocket
    from generate_series(0, 899) as g
   where not exists (
     select 1 from public.binder_cards where binder_id = p_binder and position = g
   );

  insert into public.binder_cards (binder_id, card_id, printing_id, quantity, position)
  values (p_binder, p_card, p_printing, least(99, p_delta), v_pocket);

  return least(99, p_delta);
end;
$$;

revoke all on function public.binder_card_adjust(uuid, uuid, uuid, integer) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on function public.binder_card_adjust(uuid, uuid, uuid, integer) from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on function public.binder_card_adjust(uuid, uuid, uuid, integer) from authenticated;
  end if;
end $$;

commit;
