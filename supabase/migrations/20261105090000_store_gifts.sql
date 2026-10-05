-- Ultra as a gift: the beta invitation for stores and vendors.
--
-- The founder: "a quick way to send an extended trial to people with no
-- CC info required - just a full stack setup and they have 30 days to
-- try it out. Maybe I have the option to choose lifetime, or 30 days,
-- 60 days, etc. And there will be a green block at the top that says
-- how many days they have left."
--
-- A gift is admin-granted Ultra with no card and no Stripe at all:
--   timed     - 30, 60 or 90 days; `gift_until` is the moment it ends.
--   founding  - a Founding Store, Ultra free for life; no end. Capped
--               at ten by the server (the scarcity is the point).
-- The grant sets `stores.tier` to 'ultra', the same column every
-- feature gate already reads, so a gifted store passes exactly the way
-- a paying one does. A daily sweep (/api/cron/gifts) sends the reminders
-- and ends a timed gift; ending lowers the tier only when no paid
-- subscription has taken over.
--
-- The gift row is never cleared when it ends: `gift_kind` staying set
-- is what keeps the founding price for a store that was in the beta.

begin;

alter table public.stores
  add column if not exists gift_kind text,
  add column if not exists gift_started_at timestamptz,
  add column if not exists gift_until timestamptz,
  add column if not exists gift_days integer,
  add column if not exists gift_week_notice_at timestamptz,
  add column if not exists gift_day_notice_at timestamptz,
  add column if not exists gift_ended_at timestamptz;

alter table public.stores drop constraint if exists stores_gift_shape;
alter table public.stores
  add constraint stores_gift_shape check (
    gift_kind is null
    or (gift_kind = 'founding' and gift_until is null and gift_started_at is not null)
    or (
      gift_kind = 'timed'
      and gift_until is not null
      and gift_started_at is not null
      and gift_days between 1 and 366
    )
  );

comment on column public.stores.gift_kind is
  'Ultra given in the beta: timed (gift_until ends it) or founding (free for life). Null for none. Stays set after it ends, for the founding price.';

-- The sweep reads live timed gifts only.
create index if not exists stores_live_timed_gift_idx
  on public.stores (gift_until)
  where gift_kind = 'timed' and gift_ended_at is null;

commit;
