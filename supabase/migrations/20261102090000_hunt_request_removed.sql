-- Taking a card off a hunt.
--
-- A hunt's cards outlive their Flares by design: nothing about a
-- Flare's life may remove a card from a hunt, and no code deletes a
-- request row. The owner taking a card off their own hunt is the one
-- legitimate way out, and it is a soft removal: the row stays, with
-- removed_at set, so a trade that closed against it still has its
-- history and an undo stays possible. Readers skip removed rows.
--
-- The unique index that keeps a card to one row per hunt and printing
-- has to let a removed card come back, so it covers live rows only.

begin;

alter table public.hunt_requests
  add column if not exists removed_at timestamptz;

drop index if exists public.hunt_requests_card_idx;

create unique index hunt_requests_card_idx
  on public.hunt_requests (
    hunt_id,
    card_id,
    coalesce(printing_id, '00000000-0000-0000-0000-000000000000'::uuid)
  )
  where removed_at is null;

commit;
