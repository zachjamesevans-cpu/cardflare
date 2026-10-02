-- Custom binders, and the Trade binder named as such.
--
-- The founder's profile redesign (2026-10-02): "Introduce or formalize
-- one special system binder: 'Trade Binder'... Cards inside the Trade
-- Binder represent cards the user is actively willing to trade." and
-- "Other binders should act more like collection folders / showcases...
-- These should NOT automatically participate in nearby trade matching."
--
-- The Trade binder is what the binder has been: the Have list in
-- player_cards, with its settings in player_binders. Two things change
-- about it here. It is public to signed-in players by default now, the
-- founder: "Be public to users in the relevant CardFlare Room / local
-- trading context" (a player can still make it private). And every card
-- in it counts as available to trade, which is what `local_trade` has
-- always meant for nearby matching; the old per-card toggle is gone, so
-- the rows are brought up to date. Nearby matching still needs the
-- player's own nearby_matching switch, so nobody who did not opt in to
-- being matched is matched by this.
--
-- Custom binders are their own tables, so their cards can never leak
-- into matching, the room, or an offer by sharing a row with the Have
-- list. Public by default: they are showcases.

begin;

alter table public.player_binders
  alter column is_public set default true;

update public.player_cards set local_trade = true where local_trade = false;

create table public.binders (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players (id) on delete cascade,
  name text not null,
  cover text not null default 'charcoal',
  layout smallint not null default 3,
  is_public boolean not null default true,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint binders_name_length check (char_length(name) between 1 and 40),
  constraint binders_layout check (layout in (2, 3)),
  constraint binders_cover check (
    cover in ('charcoal', 'lime', 'ember', 'frost', 'rose', 'galaxy', 'gold')
  )
);

comment on table public.binders is
  'A player''s custom binders: folders and showcases, named by them. Never the Trade binder, which is player_cards; a custom binder''s cards take no part in matching.';

create index binders_player_idx on public.binders (player_id, position);

create table public.binder_cards (
  id uuid primary key default gen_random_uuid(),
  binder_id uuid not null references public.binders (id) on delete cascade,
  card_id uuid not null references public.cards (id) on delete cascade,
  printing_id uuid references public.card_printings (id) on delete set null,
  quantity integer not null default 1,
  note text,
  /* The pocket the owner dragged it to. Null = not placed yet, shown first. */
  position integer,
  created_at timestamptz not null default now(),

  constraint binder_cards_quantity check (quantity between 1 and 99),
  constraint binder_cards_note_short check (note is null or char_length(note) <= 140)
);

comment on table public.binder_cards is
  'The cards in a custom binder. A card may sit in several custom binders; each row is one binder''s copy of it.';

create index binder_cards_binder_idx on public.binder_cards (binder_id, position);

/* One row per card and printing per binder; "any printing" counts as one. */
create unique index binder_cards_one_per_printing
  on public.binder_cards (binder_id, card_id, coalesce(printing_id, '00000000-0000-0000-0000-000000000000'::uuid));

/* The card in the cover window, one of the binder's own rows. */
alter table public.binders
  add column front_card_id uuid references public.binder_cards (id) on delete set null;

/* Same stance as every table a player writes: RLS on, zero policies,
   privileges revoked. The server reads and writes after proving who
   is asking. */
alter table public.binders enable row level security;
alter table public.binder_cards enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['binders', 'binder_cards'] loop
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('revoke all on public.%I from anon', t);
    end if;
    if exists (select 1 from pg_roles where rolname = 'authenticated') then
      execute format('revoke all on public.%I from authenticated', t);
    end if;
  end loop;
end $$;

commit;
