-- Direct messages.
--
-- Local's threads were tied to one Flare on purpose: every conversation
-- had a card as its subject. The founder's revision (2026-10-01): "I
-- should be able to go on someone's profile and message them directly
-- about anything." So a thread may now have NO anchor at all. It is the
-- same table, the same two accounts, the same close-is-final rule, and
-- the same one-notice-per-sitting ring; only the card is optional.
--
-- One direct conversation per pair, whichever side opened it. The
-- unique index orders the two ids so A→B and B→A land on one row.

begin;

alter table public.flare_threads
  drop constraint if exists flare_threads_one_anchor;

/* At most one anchor. None means a direct message. */
alter table public.flare_threads
  add constraint flare_threads_one_anchor
    check (not (flare_id is not null and want_id is not null));

create unique index if not exists flare_threads_direct_unique_idx
  on public.flare_threads (
    least(author_player_id, responder_player_id),
    greatest(author_player_id, responder_player_id)
  )
  where flare_id is null and want_id is null;

comment on table public.flare_threads is
  'One conversation between two accounts: about a Flare, about a saved want, or about nothing in particular (a direct message). Accounts on both ends, deliberately.';

commit;
