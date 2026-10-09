-- Binder pages, read in the background by an agent, and a notice when
-- they are ready.
--
-- The founder (2026-10-09): "I really think that the full binder page
-- scans should be fully agentic. It is a further away picture, often
-- with glare inside a binder, so it's best to have it do a full pass.
-- Maybe it scans it, and then they'll get a notification once it's
-- ready." And: "binder page scanning needs to be a fully paid pro
-- feature... not a single page can be scanned for free", with twenty
-- pages a day per account.
--
-- One row per page. The player's phone sends the page and its nine
-- pockets and can be closed; the server reads the page with a model
-- that searches the catalogue and compares card art, keeps what it
-- found on the row, and when every page of the queue (the batch) is
-- done, sends one "pages ready" notice. The player checks the pages
-- and places them; the photos go and the row is closed. Nothing is
-- placed without the player.
--
-- The photos live in a private bucket of their own, under
-- <player>/<batch>/<page>/, for as long as the page is waiting: they
-- are removed when it is placed or thrown away, and a daily sweep
-- removes rows and photos older than seven days. A closed row is kept
-- until then, without its photos, because it is what the twenty-pages-
-- a-day count counts.
--
-- Read and written by the server only, as every table here: row level
-- security on, no policies.

begin;

create table if not exists public.page_scans (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players (id) on delete cascade,
  binder_id uuid not null references public.binders (id) on delete cascade,
  -- One queue of pages, scanned together and announced together.
  batch_id uuid not null,
  -- The page in the binder it fills, 1-based as people count.
  page_number integer not null check (page_number between 1 and 100),
  status text not null default 'queued'
    check (status in ('queued', 'reading', 'ready', 'failed')),
  attempts integer not null default 0,
  -- Storage paths: { "page": "...", "pockets": ["...", null, ...] }.
  photos jsonb not null,
  -- What the reader found, pocket by pocket, once the page is read.
  result jsonb,
  error text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  -- Set once on every row of a batch when its notice has gone.
  notified_at timestamptz,
  -- Placed or thrown away: the photos are gone, the row stays a day for
  -- the twenty-a-day count and is swept with the rest after seven.
  closed_at timestamptz,
  unique (batch_id, page_number)
);

comment on table public.page_scans is
  'Binder pages scanned for reading: one row per page, closed once placed or thrown away, swept after seven days.';

-- Twenty pages a day: the count of an account's rows in the last day.
create index if not exists page_scans_player_created
  on public.page_scans (player_id, created_at);

-- The sweep for pages a reader never finished.
create index if not exists page_scans_unfinished
  on public.page_scans (status, started_at)
  where status in ('queued', 'reading');

create index if not exists page_scans_batch on public.page_scans (batch_id);

alter table public.page_scans enable row level security;

-- The notice when a queue of pages is ready to check.
alter table public.notifications
  drop constraint if exists notifications_kind_check;

alter table public.notifications
  add constraint notifications_kind_check
    check (kind in (
      'offer-received',
      'trade-confirmed',
      'early-board',
      'board-open',
      'new-follower',
      'room-flare',
      'message-received',
      'nearby-match',
      'post-comment',
      'store-post',
      'night-match',
      'night-reminder',
      'pages-ready'
    ));

commit;

-- The photos' bucket: private, images only, 4MB a file. Guarded on the
-- storage schema existing, so the migration still applies against the
-- bare PostgreSQL used for probing.
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('scans', 'scans', false, 4194304, array['image/jpeg', 'image/png', 'image/webp'])
    on conflict (id) do nothing;
  end if;
end $$;
