-- The binder-page scanner, second generation.
--
-- The founder (2026-10-13): "Photograph your real trading card binder once,
-- and watch CardFlare recreate it digitally with the same cards in the same
-- exact positions." Accuracy first, then speed, then cost.
--
-- Additive only: four new tables, one new column, one new function. Nothing
-- existing is dropped or rewritten.
--
-- 1. page_scans.vision: where the page and its nine pockets were found in
--    the photo, how, and how surely (page-vision.ts).
-- 2. scanner_settings: one row. Which AI does the reading (Anthropic,
--    OpenAI, or Anthropic first and OpenAI only for the unsure cards), the
--    confidence thresholds, the per-page spending cap and model prices.
--    Changed from /admin/scanner, never by players.
-- 3. scan_recognitions: what a model read off one card picture, by the
--    picture's hash, so the identical picture is never paid for twice. The
--    picture itself is not kept here.
-- 4. scan_runs: one row per scan, for the cost and accuracy numbers: the
--    calls made, tokens, cents, time, and how many cards were sure.
-- 5. scan_benchmarks: the admin's labelled test photos and each mode's
--    results on them.
-- 6. binder_place_scanned: puts a scanned page into a binder in one
--    transaction, so a failure part way cannot misplace or double a card,
--    and a full pocket is only ever moved aside when the player said so.

begin;

-- 1 -------------------------------------------------------------------------

alter table public.page_scans add column if not exists vision jsonb;

comment on column public.page_scans.vision is
  'Where the page and its pockets were found: {method, confidence, needsAlignment, page, pockets[{slot, quad, glare}], blurry}.';

-- 2 -------------------------------------------------------------------------

create table if not exists public.scanner_settings (
  id smallint primary key default 1 check (id = 1),
  mode text not null default 'hybrid' check (mode in ('anthropic', 'openai', 'hybrid')),
  auto_accept numeric not null default 0.75 check (auto_accept between 0 and 1),
  review_floor numeric not null default 0.35 check (review_floor between 0 and 1),
  page_cap_cents numeric not null default 5 check (page_cap_cents between 0 and 100),
  prices jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,
  constraint scanner_settings_thresholds check (review_floor <= auto_accept)
);

comment on table public.scanner_settings is
  'The page scanner''s one row of settings: provider mode, confidence thresholds, spending cap, model prices (USD per million tokens, {model: [input, output, cached]}).';

insert into public.scanner_settings (id) values (1) on conflict (id) do nothing;

alter table public.scanner_settings enable row level security;

-- 3 -------------------------------------------------------------------------

create table if not exists public.scan_recognitions (
  hash text not null,
  provider text not null,
  model text not null,
  prompt_version integer not null,
  read jsonb not null,
  created_at timestamptz not null default now(),
  primary key (hash, provider, model, prompt_version)
);

comment on table public.scan_recognitions is
  'What a model read off one card picture, keyed by the picture''s SHA-256. No picture is stored. Swept after 30 days.';

create index if not exists scan_recognitions_created on public.scan_recognitions (created_at);

alter table public.scan_recognitions enable row level security;

-- 4 -------------------------------------------------------------------------

create table if not exists public.scan_runs (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  player_id uuid references public.players (id) on delete set null,
  -- Not a foreign key: page scans are swept after a week, the numbers stay.
  page_scan_id uuid,
  kind text not null check (kind in ('page', 'card', 'pocket', 'benchmark')),
  mode text not null,
  calls jsonb not null default '[]'::jsonb,
  cards integer not null default 0,
  retries integer not null default 0,
  cents numeric not null default 0,
  ms integer not null default 0,
  matched integer not null default 0,
  review integer not null default 0,
  unrecognized integer not null default 0,
  empty integer not null default 0,
  -- Pockets the player changed before placing: filled in when they place.
  corrections integer,
  detect_method text
);

comment on table public.scan_runs is
  'One row per scan: provider calls with tokens and cents, time, and how the pockets came out. No images, no keys.';

create index if not exists scan_runs_created on public.scan_runs (created_at);
create index if not exists scan_runs_page on public.scan_runs (page_scan_id);

alter table public.scan_runs enable row level security;

-- 5 -------------------------------------------------------------------------

create table if not exists public.scan_benchmarks (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  label text not null default '' check (char_length(label) <= 120),
  -- Each mode's pockets, time, tokens and cents: {anthropic, openai, hybrid}.
  runs jsonb not null default '{}'::jsonb,
  -- The right answer per slot, set by the admin: [{slot, empty, cardId, printingId}].
  truth jsonb
);

comment on table public.scan_benchmarks is
  'The admin''s labelled scanner test photos and each provider mode''s result, for measured accuracy.';

alter table public.scan_benchmarks enable row level security;

-- 6 -------------------------------------------------------------------------

-- Each placement's result, by its key (the page scan and the part), so a
-- placement retried after a lost answer replays its first result instead
-- of counting every card up a second time.
create table if not exists public.binder_scan_placements (
  key text primary key,
  binder_id uuid not null references public.binders (id) on delete cascade,
  result jsonb not null,
  created_at timestamptz not null default now()
);

comment on table public.binder_scan_placements is
  'Scanned-page placements already made, by key, so a retry cannot place a page twice. Swept after 30 days.';

alter table public.binder_scan_placements enable row level security;

-- p_cards: [{pocket, card_id, printing_id}], each pocket at most once.
-- p_mode: 'skip' leaves a full pocket's scanned card out (what builds from
--   before this send), 'ask' places nothing and returns the full pockets
--   when there are any, 'replace' moves the cards in full pockets aside
--   (still in the binder, to the pockets after its last card) and puts
--   the scanned cards in.
-- A card from before binders had pockets (no position) is drawn in the
-- first free pocket, newest first (binder.ts pocketsFor). It is given that
-- pocket here first, so it counts as there: nothing moves on screen.
-- Every scanned card takes its own pocket, so two copies of one card on a
-- page are two pockets (20261120091000_binder_pocket_copies lets a binder
-- hold the same card in several). The same card and printing already in
-- that very pocket is left as it is and counted as unchanged, so a page
-- placed twice does not double.
create or replace function public.binder_place_scanned(
  p_binder uuid,
  p_cards jsonb,
  p_mode text default 'skip',
  p_key text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entry jsonb;
  v_unplaced uuid;
  v_free integer := 0;
  v_end integer;
  v_pocket integer;
  v_card uuid;
  v_printing uuid;
  v_existing public.binder_cards%rowtype;
  v_occupant uuid;
  v_conflicts integer[] := '{}';
  v_count integer;
  v_added integer := 0;
  v_unchanged integer := 0;
  v_displaced integer := 0;
  v_skipped integer := 0;
  v_occupied integer := 0;
  v_first integer;
  v_touched jsonb := '[]'::jsonb;
  v_result jsonb;
begin
  if p_mode not in ('skip', 'ask', 'replace') then
    raise exception 'Unknown placement mode %', p_mode;
  end if;

  -- One placement at a time per binder: the pockets and the cap hold.
  perform 1 from public.binders where id = p_binder for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not-found');
  end if;

  -- Placed already under this key: the same answer, nothing done twice.
  if p_key is not null then
    select result into v_result
      from public.binder_scan_placements
     where key = p_key and binder_id = p_binder;
    if found then
      return v_result || jsonb_build_object('replayed', true);
    end if;
  end if;

  for v_unplaced in
    select id from public.binder_cards
     where binder_id = p_binder and position is null
     order by created_at desc
  loop
    while exists (
      select 1 from public.binder_cards where binder_id = p_binder and position = v_free
    ) loop
      v_free := v_free + 1;
    end loop;
    exit when v_free > 899;
    update public.binder_cards set position = v_free where id = v_unplaced;
  end loop;

  if p_mode = 'ask' then
    select coalesce(array_agg(distinct (e ->> 'pocket')::integer order by (e ->> 'pocket')::integer), '{}')
      into v_conflicts
      from jsonb_array_elements(p_cards) e
     where exists (
       select 1 from public.binder_cards c
        where c.binder_id = p_binder
          and c.position = (e ->> 'pocket')::integer
          -- The same card already there is not a conflict: it counts up.
          and not (c.card_id = (e ->> 'card_id')::uuid
                   and coalesce(c.printing_id, '00000000-0000-0000-0000-000000000000'::uuid)
                     = coalesce((e ->> 'printing_id')::uuid, '00000000-0000-0000-0000-000000000000'::uuid))
     );
    if array_length(v_conflicts, 1) > 0 then
      return jsonb_build_object('ok', false, 'reason', 'occupied', 'pockets', to_jsonb(v_conflicts));
    end if;
  end if;

  select count(*) into v_count from public.binder_cards where binder_id = p_binder;
  -- Where a moved-aside card goes: after the binder's last card and the
  -- scanned pages, never into a pocket the player left empty on purpose.
  select greatest(
           coalesce((select max(position) from public.binder_cards where binder_id = p_binder), -1),
           coalesce((select max((e ->> 'pocket')::integer) from jsonb_array_elements(p_cards) e), -1)
         ) + 1
    into v_end;

  for v_entry in
    select e from jsonb_array_elements(p_cards) e order by (e ->> 'pocket')::integer
  loop
    v_pocket := (v_entry ->> 'pocket')::integer;
    v_card := (v_entry ->> 'card_id')::uuid;
    v_printing := nullif(v_entry ->> 'printing_id', '')::uuid;
    if v_pocket is null or v_pocket < 0 or v_pocket > 899 or v_card is null then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    select * into v_existing
      from public.binder_cards
     where binder_id = p_binder
       and position = v_pocket
       and card_id = v_card
       and printing_id is not distinct from v_printing;
    if found then
      v_unchanged := v_unchanged + 1;
      continue;
    end if;

    select id into v_occupant
      from public.binder_cards
     where binder_id = p_binder and position = v_pocket;
    if found then
      if p_mode = 'replace' then
        update public.binder_cards
           set position = case when v_end <= 899 then v_end else null end
         where id = v_occupant;
        v_end := v_end + 1;
        v_displaced := v_displaced + 1;
      else
        v_occupied := v_occupied + 1;
        continue;
      end if;
    end if;

    if v_count >= 200 then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    insert into public.binder_cards (binder_id, card_id, printing_id, quantity, position)
    values (p_binder, v_card, v_printing, 1, v_pocket);
    v_count := v_count + 1;
    v_added := v_added + 1;
    v_first := least(coalesce(v_first, v_pocket), v_pocket);
    v_touched := v_touched || jsonb_build_object('card_id', v_card, 'printing_id', v_printing);
  end loop;

  v_result := jsonb_build_object(
    'ok', true,
    'added', v_added,
    -- Always 0 now: kept for builds that read it.
    'merged', 0,
    'unchanged', v_unchanged,
    'displaced', v_displaced,
    'skipped', v_skipped,
    'occupied', v_occupied,
    'first_pocket', v_first,
    'touched', v_touched
  );
  if p_key is not null then
    insert into public.binder_scan_placements (key, binder_id, result)
    values (p_key, p_binder, v_result);
  end if;
  return v_result;
end;
$$;

drop function if exists public.binder_place_scanned(uuid, jsonb, text);
revoke all on function public.binder_place_scanned(uuid, jsonb, text, text) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on function public.binder_place_scanned(uuid, jsonb, text, text) from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on function public.binder_place_scanned(uuid, jsonb, text, text) from authenticated;
  end if;
end $$;

commit;
