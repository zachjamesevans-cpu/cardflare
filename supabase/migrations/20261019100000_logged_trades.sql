-- Trades logged by hand.
--
-- The trade history only knew trades confirmed in a room. The founder:
-- "allow me to enter my own trades. Like if I did something off of
-- CardFlare." A logged trade is the player's own word: one card, which
-- way it went, who with, where and when, with a note. It earns no
-- Embers, because nobody else confirmed it, and only its author ever
-- sees it. Stores still see nothing but totals.

begin;

create table public.logged_trades (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),

  player_id uuid not null references public.players (id) on delete cascade,

  card_id uuid not null references public.cards (id) on delete cascade,
  printing_id uuid references public.card_printings (id) on delete set null,
  quantity integer not null default 1,

  /* 'got': the card came to the player. 'gave': it left their binder. */
  direction text not null,

  /*
   * The other side, as a CardFlare account when they have one, so a
   * renamed partner reads under their current name; or as typed, for
   * the person at the next table who is not on CardFlare. Either, both
   * or neither: a trade with a stranger is still a trade worth writing.
   */
  partner_player_id uuid references public.players (id) on delete set null,
  partner_name text,

  /* Where it happened, in the player's words. A store name, usually. */
  place text,

  traded_on date not null default current_date,
  note text,

  constraint logged_trades_quantity_sane check (quantity between 1 and 99),
  constraint logged_trades_direction check (direction in ('got', 'gave')),
  constraint logged_trades_partner_name_short
    check (partner_name is null or char_length(partner_name) between 1 and 60),
  constraint logged_trades_place_short
    check (place is null or char_length(place) between 1 and 80),
  constraint logged_trades_note_short
    check (note is null or char_length(note) between 1 and 140),
  /* Tomorrow is allowed: a date typed at 9am in Auckland is already
     tomorrow on this server's clock. */
  constraint logged_trades_not_future check (traded_on <= current_date + 1),
  constraint logged_trades_not_self
    check (partner_player_id is null or partner_player_id <> player_id)
);

comment on table public.logged_trades is
  'A trade the player wrote down themselves. Their word only: no Embers, no confirmation, visible to nobody else.';

create index logged_trades_player_idx
  on public.logged_trades (player_id, traded_on desc, created_at desc);

/* Same stance as trades: RLS on, zero policies, privileges revoked. The
   service role reads and writes after the server has proved who is asking. */
alter table public.logged_trades enable row level security;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on public.logged_trades from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on public.logged_trades from authenticated;
  end if;
end $$;

commit;
