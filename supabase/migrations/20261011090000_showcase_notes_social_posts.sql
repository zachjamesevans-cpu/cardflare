-- A refinement pass: showcase notes and social Flare posts.
--
-- The founder: "1. showcase swiping 2. showcase card notes 3. Flare posts
-- should feel more social." The first needs no schema. The second is one
-- column. The third is two small tables and one backfill, and reuses the
-- room's offer machinery for the "I have this" answer so the author's
-- existing flow keeps working with nothing bolted beside it.
--
-- The founder ran this by hand in the SQL editor before the code landed
-- ("okay i did the supabase stuff"); it is here so the schema history
-- stays complete and tests/unit/notification-kinds.test.ts can read the
-- constraint.
begin;

/* -------------------------------------------------------------------------- */
/* 1. A note on a showcase card                                               */
/* -------------------------------------------------------------------------- */

/* "Pulled this at my first locals." Short by design: it is a caption on
   a card, not a post. Null is no note, and an empty string is written
   as null by the code so the two never disagree. */
alter table public.player_showcase
  add column if not exists note text
    check (note is null or char_length(note) <= 140);

comment on column public.player_showcase.note is
  'The owner''s caption for this card, up to 140 characters. Shown under the zoomed card and in the editor. Null when there is none.';

/* -------------------------------------------------------------------------- */
/* 2. Every Flare belongs to a post                                           */
/* -------------------------------------------------------------------------- */

/* Likes and comments hang off the post, not the Flare, so a hunt for six
   cards has one thread rather than six. A Flare posted alone is a post
   of one: its own id is its batch, so nothing has to special-case it. */
update public.flares set posted_batch = id where posted_batch is null;
alter table public.flares alter column posted_batch set not null;

/* -------------------------------------------------------------------------- */
/* 3. Likes and comments                                                      */
/* -------------------------------------------------------------------------- */

create table public.flare_post_likes (
  post_id uuid not null,
  player_id uuid not null references public.players (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, player_id)
);
create index flare_post_likes_post_idx on public.flare_post_likes (post_id);

create table public.flare_post_comments (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  post_id uuid not null,
  player_id uuid not null references public.players (id) on delete cascade,
  /* An offer comment names the card it answers. */
  flare_id uuid references public.flares (id) on delete set null,
  kind text not null default 'comment' check (kind in ('comment', 'offer')),
  body text not null check (char_length(btrim(body)) between 1 and 280)
);
create index flare_post_comments_post_idx
  on public.flare_post_comments (post_id, created_at);

/* Service role only, like every other player table: the website and
   the app's API write these on a signed-in player's behalf. */
alter table public.flare_post_likes enable row level security;
alter table public.flare_post_comments enable row level security;
revoke all on public.flare_post_likes from anon, authenticated;
revoke all on public.flare_post_comments from anon, authenticated;

/* -------------------------------------------------------------------------- */
/* 4. The notice                                                              */
/* -------------------------------------------------------------------------- */

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
      'post-comment'
    ));

commit;
