-- Trades: the record that the loop closed.
--
-- Everything upstream of this is intent — a Flare says "I want", a binder
-- says "I have", an offer says "come find me". A trade row says it actually
-- happened, in this room, between these two people, for this card. It is the
-- raw material for a store's "was tonight worth it" numbers and for
-- Milestone 8's history, and it is written once, by the Flare's author,
-- when the cards change hands.
--
-- **What a trade deliberately is not**: an escrow, a valuation, or a
-- marketplace record. No prices anywhere, per PRODUCT.md. It is a tally mark
-- with names on it.
--
-- Deletion semantics differ from every table before it, on purpose:
--
-- - The event going away takes its trades with it (`cascade`) — analytics
--   for a deleted event are noise.
-- - A *player session* going away does NOT take the trade: sessions expire
--   in 30 days by design, and a store's event numbers must not quietly
--   shrink as they do. The session columns go null and the tally survives.
-- - Same for the flare and the printing: history outlives its pointers.
-- - The card stays a hard reference: catalog rows are upserted by sync, not
--   deleted in normal operation, and a trade of no card means nothing.

begin;

/*
 * A Flare that traded is neither open nor cancelled. Postgres 12+ allows
 * adding an enum value inside a transaction so long as the same transaction
 * does not use it — and nothing below does.
 */
alter type public.flare_status add value if not exists 'traded';

create table public.trades (
  id uuid primary key default gen_random_uuid(),

  event_id uuid not null references public.events (id) on delete cascade,

  -- Nullable so the tally survives the pointer, and unique below so a Flare
  -- can only ever close once.
  flare_id uuid references public.flares (id) on delete set null,

  -- Who asked and who answered. The author confirms, so requester is never
  -- null at insert; both go null if the sessions expire before the event's
  -- history does.
  requester_session_id uuid
    references public.player_sessions (id) on delete set null,
  holder_session_id uuid
    references public.player_sessions (id) on delete set null,

  -- Snapshot of what the Flare asked for, so history reads without a join
  -- to a row that may since have been re-posted with different terms.
  card_id uuid not null references public.cards (id) on delete cascade,
  printing_id uuid references public.card_printings (id) on delete set null,
  quantity integer not null default 1,

  confirmed_at timestamptz not null default now(),

  constraint trades_quantity_sane check (quantity between 1 and 99),

  -- You cannot trade with yourself. `is distinct from` because the holder
  -- may legitimately be null — a trade with someone who never tapped
  -- "offer" is still a trade worth tallying.
  constraint trades_not_self
    check (requester_session_id is distinct from holder_session_id
           or requester_session_id is null)
);

comment on table public.trades is
  'A confirmed in-person trade, written by the Flare''s author. A tally mark with names on it — no prices, per PRODUCT.md.';

/*
 * One trade per Flare. This is what makes confirming retry-safe: the insert
 * runs before the Flare is closed, so a retry after a half-completed confirm
 * hits this index instead of double-counting the night.
 */
create unique index trades_one_per_flare_idx
  on public.trades (flare_id)
  where flare_id is not null;

-- The store's read: everything that happened at one event.
create index trades_event_idx on public.trades (event_id, confirmed_at desc);

-- The players' reads: "your trades tonight", both sides.
create index trades_requester_idx on public.trades (requester_session_id);
create index trades_holder_idx on public.trades (holder_session_id);

/*
 * Same stance as flares, binders and offers: guests have no auth.uid(), so
 * RLS is on with zero policies and the public roles hold nothing. Every
 * access goes through the service role behind a proved session or an
 * authorised store viewer.
 */
alter table public.trades enable row level security;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on public.trades from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on public.trades from authenticated;
  end if;
end $$;

commit;
