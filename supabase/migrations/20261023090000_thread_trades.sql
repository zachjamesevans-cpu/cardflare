-- Trades confirmed in a conversation.
--
-- The audit of 2026-10-01: "zero confirmed trades in 30 days suggests
-- confirming is too hard, and confirming is the only way to earn
-- Embers." A trade could only be written in a room, by a Flare's
-- author, against a session. Most trades on CardFlare are now arranged
-- in a conversation, between two accounts, and happen wherever the two
-- of them met. So a trade may now belong to a conversation instead of
-- a room: either side says "We traded", the other confirms, and both
-- earn, under the same rules a room trade pays by.
--
-- The row keeps every column a room trade has. What changes:
--
-- - `event_id` may be null, and `thread_id` names the conversation
--   instead. A trade has exactly one of the two.
-- - The two people are named by ACCOUNT, because a conversation has no
--   sessions. `requester_player_id` is the side a room would call the
--   requester (the Flare's or the want's owner; on a direct message,
--   whoever got the card) and `holder_player_id` the other.
-- - `proposed_by` is whichever account said it. In a room the author
--   always does; in a conversation either side can, so the row has to
--   say whose word is still waiting on the other's.

begin;

alter table public.trades
  alter column event_id drop not null;

alter table public.trades
  add column if not exists thread_id uuid
    references public.flare_threads (id) on delete set null,
  add column if not exists requester_player_id uuid
    references public.players (id) on delete set null,
  add column if not exists holder_player_id uuid
    references public.players (id) on delete set null,
  add column if not exists proposed_by uuid
    references public.players (id) on delete set null;

comment on column public.trades.thread_id is
  'The conversation this trade was confirmed in, for a trade made outside a room. Null for a room trade.';
comment on column public.trades.requester_player_id is
  'The account on the requester side of a conversation trade: the Flare or want owner, or on a direct message whoever got the card.';
comment on column public.trades.holder_player_id is
  'The account on the other side of a conversation trade.';
comment on column public.trades.proposed_by is
  'Which account said "We traded". The other one is asked to confirm.';

/* A trade happens somewhere: a room, or a conversation. */
alter table public.trades
  drop constraint if exists trades_has_a_place;
alter table public.trades
  add constraint trades_has_a_place
    check (event_id is not null or thread_id is not null);

/* A conversation trade names two accounts, and not the same one twice. */
alter table public.trades
  drop constraint if exists trades_players_distinct;
alter table public.trades
  add constraint trades_players_distinct
    check (
      requester_player_id is null
      or holder_player_id is null
      or requester_player_id <> holder_player_id
    );

create index if not exists trades_thread_idx
  on public.trades (thread_id, confirmed_at desc)
  where thread_id is not null;

create index if not exists trades_requester_player_idx
  on public.trades (requester_player_id)
  where requester_player_id is not null;

create index if not exists trades_holder_player_idx
  on public.trades (holder_player_id)
  where holder_player_id is not null;

comment on table public.trades is
  'A confirmed in-person trade, written in a room by the Flare''s author or in a conversation by either side. A tally mark with names on it - no prices, per PRODUCT.md.';

commit;
