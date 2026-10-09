-- Free single-card scans: ten a day.
--
-- The founder (2026-10-09): "Free singles up to 10 a day." Scanning one
-- card is free up to ten a day; Pro scans without a limit and scans
-- whole binder pages, which stay Pro only. The count has to be exact and
-- the same on every server, so each free scan leaves a row here and the
-- day's count is a count of rows. Pro and admin scans leave none.
--
-- Swept by the daily page-scan cron after two days. Read and written by
-- the server only: row level security on, no policies.

begin;

create table if not exists public.card_scans (
  id bigint generated always as identity primary key,
  player_id uuid not null references public.players (id) on delete cascade,
  created_at timestamptz not null default now()
);

comment on table public.card_scans is
  'One row per free single-card scan, for the ten-a-day count; swept after two days.';

create index if not exists card_scans_player_created
  on public.card_scans (player_id, created_at);

alter table public.card_scans enable row level security;

commit;
