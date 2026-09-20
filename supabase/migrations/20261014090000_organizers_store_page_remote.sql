-- Organizers, the store's own page, and the remote.
--
-- Three things one round asked for, all small in the database:
--
--   1. A store owner can name a player an ORGANIZER (the "TO" badge).
--      The role already exists on store_members ('owner' | 'staff');
--      nothing read it. It is read now, and 'staff' is what an
--      organizer is. No schema change, so this file only says so.
--   2. A store gets a description for its public page, the page
--      players follow. Everything else the page shows (address, phone,
--      website) already has a column.
--   3. A timer remembers who last pressed a button on it, so two
--      organizers with two phones can see what the other did.
begin;

comment on column public.store_members.role is
  'owner runs the store and its billing; staff is an organizer (the TO badge): the event hub, the timers and the remote, nothing about money or membership.';

alter table public.stores
  add column if not exists description text
    check (description is null or char_length(description) <= 280);

comment on column public.stores.description is
  'What the store says about itself on its public page. Optional, 280 characters.';

alter table public.event_hub_timers
  add column if not exists controlled_by text,
  add column if not exists controlled_at timestamptz;

comment on column public.event_hub_timers.controlled_by is
  'Display name of whoever last pressed a control on this timer, from the console or the remote. For the other organizer''s screen, not for authorisation.';

commit;
