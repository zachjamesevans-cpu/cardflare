-- Any binder can be up for trade.
--
-- The founder (2026-10-03): "Ability for multiple types of binders -
-- and a toggle to enable it as a public / trade binder. Anything that's
-- public is up for trade. IRL people will have a trade binder of bigger
-- cards, and sometimes a separate binder for things such as lower
-- dollar 'playables'."
--
-- So there is no system Trade binder any more. Every binder is one of
-- the player's own, named by them, with ONE switch, for_trade: on means
-- public to signed-in players and its cards are available to trade
-- (they feed nearby matching and the room); off means private, only the
-- owner opens it. is_public is kept in step with for_trade, because the
-- founder's rule is that the two are the same fact.
--
-- The Have list (player_cards) stays what matching, the room and offers
-- read. It is DERIVED now: the union of the cards in every binder that
-- is up for trade, kept in step by the server on every write. Here,
-- every player who has a Have list gets a binder named "Trade binder",
-- up for trade, holding those cards, so nothing anybody put up is lost
-- and the trade keeps flowing; and every custom binder becomes private
-- until its owner says otherwise.

begin;

alter table public.binders
  add column if not exists for_trade boolean not null default false;

comment on column public.binders.for_trade is
  'Up for trade: public to signed-in players, and its cards are on the Have list that nearby matching and the room read. Off = private.';

/* One binder per player with a Have list, holding it. */
insert into public.binders (player_id, name, cover, layout, is_public, for_trade, position)
select distinct on (ps.player_id)
  ps.player_id,
  'Trade binder',
  coalesce(pb.cover, 'charcoal'),
  3,
  true,
  true,
  -1
from public.player_sessions ps
left join public.player_binders pb on pb.player_id = ps.player_id
where ps.player_id is not null
  and exists (select 1 from public.player_cards pc where pc.player_session_id = ps.id)
  and not exists (
    select 1 from public.binders b where b.player_id = ps.player_id and b.for_trade
  )
order by ps.player_id, ps.created_at;

insert into public.binder_cards (binder_id, card_id, printing_id, quantity, note, position, created_at)
select b.id, pc.card_id, pc.printing_id, pc.quantity, pc.note, pc.position, pc.created_at
from public.player_cards pc
join public.player_sessions ps on ps.id = pc.player_session_id
join public.binders b
  on b.player_id = ps.player_id and b.for_trade and b.position = -1
on conflict do nothing;

/* Public means up for trade, and nothing else does. */
update public.binders set is_public = for_trade where is_public <> for_trade;

/* The Trade binder first, then the rest in the order they had. */
update public.binders b
set position = numbered.rn - 1
from (
  select id, row_number() over (partition by player_id order by position, created_at) as rn
  from public.binders
) numbered
where numbered.id = b.id;

/* Pages are three by three now; the picker is gone. */
update public.binders set layout = 3 where layout <> 3;
update public.player_binders set layout = 3 where layout <> 3;

commit;
