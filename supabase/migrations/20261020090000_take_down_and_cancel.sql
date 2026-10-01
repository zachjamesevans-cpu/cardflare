-- Taking a Flare down, and cancelling an event.
--
-- The audit of 2026-10-01 found that "Remove" on a Flare marked it found
-- and announced "found it" to followers, because that is what the
-- founder once asked Remove to mean. A wrong post had no way out. So a
-- Flare now has two exits: "Found it", which is the old Remove, and
-- "Take down", which withdraws it everywhere and says nothing. The
-- withdrawal is stamped so an undo can put it back within a minute.
--
-- The same audit found an event could be neither edited nor cancelled.
-- Cancelling closes it and stamps it, so the store's list can say
-- "Cancelled" rather than "Closed" and the public pages leave it out.

begin;

alter table public.flares
  add column if not exists withdrawn_at timestamptz;

comment on column public.flares.withdrawn_at is
  'When the poster took the Flare down. Set alongside status = cancelled; an undo within a minute clears both.';

alter table public.events
  add column if not exists cancelled_at timestamptz;

comment on column public.events.cancelled_at is
  'When the store cancelled the night. Set alongside status = closed, so every reader that already skips closed events skips this one too.';

commit;
