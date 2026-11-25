-- Game hubs: a page per game with its most hunted, most searched and
-- price-moving cards. The founder (2026-11-25): "like a 'top 10 most
-- searched cards' for each TCG" ... "build it all out".
--
-- What is counted is a card being OPENED (its page or sheet), per card
-- per day. A count and nothing else: no player, no session, no IP.

begin;

create table if not exists public.card_opens_daily (
  card_id uuid not null references public.cards (id) on delete cascade,
  day date not null default (now() at time zone 'utc')::date,
  opens integer not null default 0 check (opens >= 0),
  primary key (card_id, day)
);

-- Read and written only by the server (service role); nobody else.
alter table public.card_opens_daily enable row level security;

-- One more open of a card today. Upsert, so a busy card is one row a day.
create or replace function public.bump_card_open(p_card uuid)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.card_opens_daily (card_id, day, opens)
  values (p_card, (now() at time zone 'utc')::date, 1)
  on conflict (card_id, day)
  do update set opens = public.card_opens_daily.opens + 1;
$$;

-- The game's most opened cards over the last `p_days` days.
create or replace function public.game_hub_opened(p_game text, p_days integer, p_limit integer)
returns table (card_id uuid, total bigint)
language sql
stable
security definer
set search_path = public
as $$
  select o.card_id, sum(o.opens)::bigint as total
  from public.card_opens_daily o
  join public.cards c on c.id = o.card_id
  where c.game = p_game
    and o.day >= (now() at time zone 'utc')::date - p_days
  group by o.card_id
  order by total desc, o.card_id
  limit p_limit;
$$;

-- The game's cards wanted by the most players (their saved wants: what a
-- Flare puts on the list).
create or replace function public.game_hub_hunted(p_game text, p_limit integer)
returns table (card_id uuid, total bigint)
language sql
stable
security definer
set search_path = public
as $$
  select w.card_id, count(distinct w.player_id)::bigint as total
  from public.player_wants w
  join public.cards c on c.id = w.card_id
  where c.game = p_game
  group by w.card_id
  order by total desc, w.card_id
  limit p_limit;
$$;

-- The server's alone: never callable with the app's public key.
revoke all on function public.bump_card_open(uuid) from public;
revoke all on function public.game_hub_opened(text, integer, integer) from public;
revoke all on function public.game_hub_hunted(text, integer) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on function public.bump_card_open(uuid) from anon;
    revoke all on function public.game_hub_opened(text, integer, integer) from anon;
    revoke all on function public.game_hub_hunted(text, integer) from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on function public.bump_card_open(uuid) from authenticated;
    revoke all on function public.game_hub_opened(text, integer, integer) from authenticated;
    revoke all on function public.game_hub_hunted(text, integer) from authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.bump_card_open(uuid) to service_role;
    grant execute on function public.game_hub_opened(text, integer, integer) to service_role;
    grant execute on function public.game_hub_hunted(text, integer) to service_role;
  end if;
end $$;

commit;
