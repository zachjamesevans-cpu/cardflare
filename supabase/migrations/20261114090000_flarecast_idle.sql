-- FlareCast's idle mode.
--
-- The founder (2026-10-11): "an 'idle' mode for FlareCast. Basically, if
-- they're not showing a tournament timer or anything - maybe it'll show
-- some valuable cardflare info, what time it is, when next event is,
-- prior cards people were looking for there." A screen with no timer on
-- it shows the clock, the way in, and panels the store chooses; after
-- the store's hours it dims to a quiet clock and all but stops asking
-- the server for anything.
--
-- On for every screen, and every panel, by default: a store that never
-- opens the setting still gets a screen worth leaving on.

begin;

alter table public.event_hub_displays
  add column if not exists idle_mode boolean not null default true,
  add column if not exists idle_panels text[] not null
    default '{nights,wanted,trades,posts}';

alter table public.event_hub_displays
  drop constraint if exists event_hub_displays_idle_panels_known;
alter table public.event_hub_displays
  add constraint event_hub_displays_idle_panels_known
    check (idle_panels <@ array['nights', 'wanted', 'trades', 'posts']::text[]);

comment on column public.event_hub_displays.idle_mode is
  'Whether the screen shows the clock, the way in and the idle panels when no timer is on it.';
comment on column public.event_hub_displays.idle_panels is
  'Which idle panels rotate: nights, wanted, trades, posts.';

commit;
