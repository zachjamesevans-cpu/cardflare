-- Embers, second round: the holes, closed.
--
-- The founder, on the economy as it stood: "give me a whole layout of
-- how you think it should work including guardrails from preventing it
-- getting abused." Then: "fix all holes and build your suggestion."
--
-- The holes, in the order they close here:
--
--   1. One-sided confirmation. Only the Flare's author confirmed, so two
--      friends could raise a hand and confirm at each other for Embers
--      neither had earned. A trade now pays when BOTH hands are on it:
--      the partner acknowledges, and only then does either side earn.
--      A partner who never answers leaves the author the unconfirmed
--      rate after a day, and the partner nothing.
--   2. Nothing could ever be taken back. Reversals exist now: a ledger
--      row, a balance that goes down (never below zero), and a counter
--      the badge subtracts. `embers_earned` still never decrements; the
--      number a profile shows is earned minus reversed.
--   3. Nothing paid for anything but a trade, so a new player's first
--      50 was a month away. Turning up at a store they saved pays one.
--
-- The tapers (per pair, per room, per week) and the young-account rate
-- are arithmetic, in src/lib/players/ember-rules.ts, with tests. This
-- file holds only what the database has to know.
begin;

/* -------------------------------------------------------------------------- */
/* 1. A trade has two hands on it                                             */
/* -------------------------------------------------------------------------- */

alter table public.trades
  add column if not exists acknowledged_at timestamptz,
  add column if not exists paid_at timestamptz,
  add column if not exists disputed_at timestamptz,
  add column if not exists disputed_by uuid references public.players (id) on delete set null,
  add column if not exists dispute_note text
    check (dispute_note is null or char_length(dispute_note) <= 200);

comment on column public.trades.acknowledged_at is
  'When the named partner tapped "yes, we traded". Null until they do; a trade pays only after this, or the author alone at the late rate after the window.';
comment on column public.trades.paid_at is
  'When the Embers for this trade were decided, whatever the amount. Null means the payout is still pending.';
comment on column public.trades.disputed_at is
  'Set by an admin, or by a partner account being deleted within days of the trade. A disputed trade''s Embers are reversed and it no longer counts.';

/* Every trade before this round was one-handed and already paid. */
update public.trades
   set acknowledged_at = coalesce(acknowledged_at, confirmed_at),
       paid_at = coalesce(paid_at, confirmed_at)
 where paid_at is null;

/* The partner's "did you?" prompt, and the late-payout sweep. */
create index if not exists trades_awaiting_partner_idx
  on public.trades (holder_session_id, event_id)
  where acknowledged_at is null and paid_at is null;

create index if not exists trades_unpaid_idx
  on public.trades (confirmed_at)
  where paid_at is null;

/* Pair and room counting reads recent paid trades by the sessions on them. */
create index if not exists trades_paid_recent_idx
  on public.trades (confirmed_at desc)
  where paid_at is not null and disputed_at is null;

/* -------------------------------------------------------------------------- */
/* 2. Reversals                                                               */
/* -------------------------------------------------------------------------- */

alter table public.players
  add column if not exists embers_reversed integer not null default 0
    check (embers_reversed >= 0);

comment on column public.players.embers_reversed is
  'Lifetime Embers taken back by a dispute or a deleted partner. The badge shows embers_earned minus this; embers_earned itself still never goes down.';

/* The number every profile reads, kept by the database so no reader can forget the subtraction. */
alter table public.players
  add column if not exists embers_badge integer
    generated always as (embers_earned - embers_reversed) stored;

alter table public.ember_ledger
  drop constraint if exists ember_ledger_reason_check;

alter table public.ember_ledger
  add constraint ember_ledger_reason_check
    check (reason in ('trade', 'purchase', 'grant', 'attendance', 'reversal'));

/*
 * Taking Embers back, once per ref. The balance goes down by what is
 * there, never below zero: Embers already spent stay spent, and the
 * badge carries the whole reversal either way.
 */
create or replace function public.reverse_embers(
  target_player uuid,
  amount integer,
  reversal_ref text,
  reversal_note text default null
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  taken integer;
begin
  if amount <= 0 then
    return false;
  end if;

  update public.players
     set embers_reversed = embers_reversed + amount,
         embers_balance = greatest(0, embers_balance - amount)
   where id = target_player
     and not exists (select 1 from public.ember_ledger where ref = reversal_ref)
  returning least(amount, embers_balance + amount) into taken;

  if taken is null then
    return false;
  end if;

  insert into public.ember_ledger (player_id, reason, earned_delta, balance_delta, ref, note)
  values (target_player, 'reversal', 0, -taken, reversal_ref, reversal_note);

  return true;
end;
$function$;

revoke all on function public.reverse_embers(uuid, integer, text, text) from public;

commit;
