-- Milestones: one-off rewards for doing the things cardflare is for.
--
-- From the Embers review (2026-10-11), step 4: earning came almost only
-- from trades, and the badge tiers unlocked nothing. Milestones pay
-- Embers once each (first Flare, first trade, trading partners, hunts
-- finished, turning up at your store), and every badge tier reached
-- puts a sealed pack in your hands. The rules live in
-- src/lib/players/milestone-rules.ts.
--
-- Safe to run twice.

begin;

-- 1. A milestone is its own reason in the ledger, so the Embers report
--    can tell it apart from a trade. The ref keeps each one to once.
alter table public.ember_ledger
  drop constraint if exists ember_ledger_reason_check;
alter table public.ember_ledger
  add constraint ember_ledger_reason_check
    check (reason in ('trade', 'purchase', 'grant', 'attendance', 'reversal', 'milestone'));

-- 2. A pack can arrive as a milestone's reward, and carries a ref so the
--    same tier never pays twice, however many times the check runs.
alter table public.player_packs
  drop constraint if exists player_packs_source_check;
alter table public.player_packs
  add constraint player_packs_source_check
    check (source in ('signup', 'purchase', 'milestone'));

alter table public.player_packs
  add column if not exists ref text;

create unique index if not exists player_packs_ref_idx
  on public.player_packs (ref)
  where ref is not null;

commit;
