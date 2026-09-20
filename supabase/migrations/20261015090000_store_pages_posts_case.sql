-- A store's page, the way a player's is; a store's posts; the case.
--
-- The founder: "think of the store pages similar to how players can
-- customize their pages. banner image, etc." and, on what a follower
-- gets back, store posts in the Feed. Three tables' worth, all small:
--
--   stores          gain a logo, a banner, hours, and the moment the
--                   owner finished (or skipped) the setup wizard.
--   store_games     which games a store runs, from the one game list.
--   store_posts     what a store says to its followers: a title, a
--                   line or two, a picture, and optionally the event
--                   night it is about, so "I'll be there" is one tap.
--                   Likes and comments reuse the Flare post tables,
--                   whose post_id is a bare uuid on purpose.
--   store_case_picks up to six cards from the store's synced singles,
--                   curated by hand for the "in the case" shelf.
begin;

alter table public.stores
  add column if not exists logo_image text,
  add column if not exists cover_image text,
  add column if not exists hours jsonb,
  add column if not exists onboarding_completed_at timestamptz;

comment on column public.stores.logo_image is
  'Object path in the avatars bucket, store-logos/<store>/<ts>.jpg. Served through /api/avatars like every other picture.';
comment on column public.stores.cover_image is
  'Object path in the avatars bucket, store-banners/<store>/<ts>.jpg. Same 1200x900 top-anchored shape as a player cover.';
comment on column public.stores.hours is
  'Seven entries, Sunday first: {"open":"11:00","close":"21:00"} or null for closed. Validated in code; the shape lives in src/lib/stores/hours.ts.';
comment on column public.stores.onboarding_completed_at is
  'When the owner finished or skipped the setup wizard. Null sends a fresh store to /store/setup.';

create table public.store_games (
  store_id uuid not null references public.stores (id) on delete cascade,
  game text not null check (
    game in ('one-piece', 'riftbound', 'lorcana', 'mtg', 'pokemon', 'flesh-and-blood')
  ),
  primary key (store_id, game)
);

alter table public.store_games enable row level security;
revoke all on public.store_games from anon, authenticated;

create table public.store_posts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  store_id uuid not null references public.stores (id) on delete cascade,
  author_user_id uuid references auth.users (id) on delete set null,
  title text not null check (char_length(btrim(title)) between 1 and 80),
  body text check (body is null or char_length(body) <= 600),
  /* Object path in the avatars bucket, store-posts/<store>/<ts>.jpg. */
  image text,
  event_id uuid references public.events (id) on delete set null,
  published_at timestamptz not null default now(),
  archived_at timestamptz
);

create index store_posts_store_idx
  on public.store_posts (store_id, published_at desc)
  where archived_at is null;

alter table public.store_posts enable row level security;
revoke all on public.store_posts from anon, authenticated;

create table public.store_case_picks (
  store_id uuid not null references public.stores (id) on delete cascade,
  position integer not null check (position between 0 and 5),
  card_id uuid not null references public.cards (id) on delete cascade,
  primary key (store_id, position),
  unique (store_id, card_id)
);

alter table public.store_case_picks enable row level security;
revoke all on public.store_case_picks from anon, authenticated;

commit;
