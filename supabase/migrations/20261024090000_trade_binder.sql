-- The trade binder.
--
-- The founder (2026-10-02): "add cards you are open to trading. can
-- click on someone's profile and see their trade binder." The cards
-- are the Have list, which has always lived in player_cards and has
-- always been private, because a named person's inventory across
-- venues is a theft map. The binder is that list made public BY
-- CHOICE, drawn like the thing people carry: a cover, pages of pockets,
-- a card in the front window.
--
-- So nothing about cards changes. This is one row per player of
-- SETTINGS: whether anyone may open it, how many pockets a page has,
-- which colour the cover is, and which card sits in the front window.
-- Private by default; the switch is the owner's.
--
-- Covers are a short list of flat colours this round. The founder:
-- "a basic version of it first with a few simple color change options,
-- no animated stuff yet."

begin;

create table public.player_binders (
  player_id uuid primary key references public.players (id) on delete cascade,
  is_public boolean not null default false,
  layout smallint not null default 3,
  cover text not null default 'charcoal',
  /* The card in the cover window. One of the owner's own Have list rows;
     goes back to "newest card" when that row is removed. */
  front_entry_id uuid references public.player_cards (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint player_binders_layout check (layout in (2, 3)),
  constraint player_binders_cover check (
    cover in ('charcoal', 'lime', 'ember', 'frost', 'rose', 'galaxy', 'gold')
  )
);

comment on table public.player_binders is
  'How a player shows their Have list as a binder: public or not, pockets per page, cover colour, front card. The cards themselves are player_cards.';

comment on column public.player_binders.is_public is
  'Anyone signed in may open the binder. Off by default: a Have list is private until its owner says otherwise.';

/* Same stance as every table a player writes: RLS on, zero policies,
   privileges revoked. The server reads and writes after proving who
   is asking. */
alter table public.player_binders enable row level security;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on public.player_binders from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on public.player_binders from authenticated;
  end if;
end $$;

commit;
