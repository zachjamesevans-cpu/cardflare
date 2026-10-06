-- In-person play: counts that move by exactly what happened.
--
-- The pre-launch audit found four places where a count was read, changed
-- in the server and written back, or applied without remembering that it
-- had been:
--
-- 1. A logged trade. "Gave" deleted every binder entry for the card, and
--    "got" overwrote the quantity rather than adding to it. A binder card
--    now moves by the traded copies, one statement at a time
--    (`binder_card_adjust`), and the logged trade keeps the moves it made
--    (`binder_changes`) so deleting it puts back exactly that.
-- 2. A trade's found counts. Declining a conversation trade took copies
--    off a hunt that the trade had never added. `found_applied_at` and
--    `found_copies` say whether, and by how much, a trade moved them.
-- 3. One pending "We traded" per conversation, held by the database
--    instead of a read before the insert.
-- 4. A want's plus and minus, as one statement (`player_want_adjust`).
--
-- Safe to run again.

begin;

/* -------------------------------------------------------------------------- */
/* 1. Binder cards move by a delta                                            */
/* -------------------------------------------------------------------------- */

/*
 * Adds (positive) or takes away (negative) copies of one card and printing
 * in one binder, and returns the change actually made: a binder holds 99 of
 * a card at most and 200 cards at most, and never fewer than none. A count
 * that reaches zero takes the card out. A new card goes in the first empty
 * pocket. The row is locked for the read-modify-write, so two trades at
 * once cannot both read the same count.
 */
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
  v_next integer;
  v_pocket integer;
begin
  if p_delta is null or p_delta = 0 then
    return 0;
  end if;

  select * into v_row
    from public.binder_cards
   where binder_id = p_binder
     and card_id = p_card
     and printing_id is not distinct from p_printing
   for update;

  if found then
    v_next := least(99, v_row.quantity + p_delta);
    if v_next <= 0 then
      delete from public.binder_cards where id = v_row.id;
      return -v_row.quantity;
    end if;
    update public.binder_cards set quantity = v_next where id = v_row.id;
    return v_next - v_row.quantity;
  end if;

  if p_delta < 0 then
    return 0;
  end if;

  -- Serialise inserts into this binder so the cap and the pocket hold.
  perform 1 from public.binders where id = p_binder for update;

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

alter table public.logged_trades
  add column if not exists binder_changes jsonb not null default '[]'::jsonb;

comment on column public.logged_trades.binder_changes is
  'What logging this trade did to the binders: [{binder_id, card_id, printing_id, delta}]. Deleting the trade applies the opposite of each.';

/* -------------------------------------------------------------------------- */
/* 2. Whether a trade moved the found counts                                  */
/* -------------------------------------------------------------------------- */

alter table public.trades
  add column if not exists found_applied_at timestamptz,
  add column if not exists found_copies integer not null default 0;

comment on column public.trades.found_applied_at is
  'When this trade counted its copies as found on the hunt or Flare. Null = it never did, so reversing it must not take any off.';
comment on column public.trades.found_copies is
  'How many copies this trade added to the found count, after clamping. Reversal takes off exactly this many.';

/* Until now a trade counted its copies the moment its Flare closed as
   traded, so every live trade on a traded Flare already has. */
update public.trades t
   set found_applied_at = t.confirmed_at,
       found_copies = t.quantity
  from public.flares f
 where f.id = t.flare_id
   and f.status = 'traded'
   and t.disputed_at is null
   and t.found_applied_at is null;

/* -------------------------------------------------------------------------- */
/* 3. One pending trade per conversation                                      */
/* -------------------------------------------------------------------------- */

/* Any pair a race already let through: the newest stays the question,
   the older ones are closed as superseded so the index can stand. */
with ranked as (
  select id,
         row_number() over (partition by thread_id order by confirmed_at desc, id) as n
    from public.trades
   where thread_id is not null
     and acknowledged_at is null
     and paid_at is null
     and disputed_at is null
)
update public.trades t
   set disputed_at = now(),
       dispute_note = 'Superseded by a newer claim in the same conversation'
  from ranked
 where ranked.id = t.id
   and ranked.n > 1;

create unique index if not exists trades_one_pending_per_thread_idx
  on public.trades (thread_id)
  where thread_id is not null
    and acknowledged_at is null
    and paid_at is null
    and disputed_at is null;

/* -------------------------------------------------------------------------- */
/* 4. A want's plus and minus                                                 */
/* -------------------------------------------------------------------------- */

/*
 * Moves one of the player's wants by a delta, clamped to 1..99, and returns
 * the new quantity, or null when the want is not theirs. One statement, so
 * two quick taps land on "two more".
 */
create or replace function public.player_want_adjust(
  p_want uuid,
  p_player uuid,
  p_delta integer
) returns integer
language sql
security definer
set search_path = public
as $$
  update public.player_wants
     set quantity = least(99, greatest(1, quantity + p_delta))
   where id = p_want
     and player_id = p_player
  returning quantity;
$$;

revoke all on function public.player_want_adjust(uuid, uuid, integer) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on function public.player_want_adjust(uuid, uuid, integer) from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on function public.player_want_adjust(uuid, uuid, integer) from authenticated;
  end if;
end $$;

commit;
