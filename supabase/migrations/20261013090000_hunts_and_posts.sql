-- Hunts as real lists, Flares as real posts, offers that carry several
-- cards.
--
-- The founder's model, in his words: "A Flare is one social post
-- containing one or multiple cards. A Hunt is a persistent named list.
-- A Flare can optionally link its card requests to a Hunt. Each card
-- request tracks its own quantities. People can offer any subset of the
-- requested cards. Owners can mark cards found outside CardFlare."
--
-- Until now a hunt was the `deck_label` a Flare carried, read back off
-- `flares` and folded by name; there was no row to describe or to give
-- a visibility, no progress but a tick per Flare, and a post's caption
-- was the note on its first card. This gives each of those a home and
-- keeps every existing row where it is:
--
--   hunts           the list: owner, name, description, visibility.
--   hunt_requests   one row per card the list wants, with the copies
--                   needed and the copies found. THE authoritative
--                   progress for a linked card, on both the Feed and
--                   the profile.
--   flare_posts     the parent of a batch of flares: author, intent,
--                   caption, where it was posted, an optional hunt.
--                   Keyed by the same id `flares.posted_batch` already
--                   carries, so nothing about grouping changes.
--   flares          gain the link to their hunt request, and a copies-
--                   found count of their own for a card posted outside
--                   any hunt.
--   flare_responses gain an offer batch, so "I have these three" is one
--                   offer with three lines rather than three offers.
--
-- Backfill recovers what can be recovered reliably and nothing else:
-- a hunt for every (account, deck label) the account itself typed, and
-- a post for every existing batch id. Flares a GUEST session labelled
-- have no account to own a hunt, so they stay as they were.
begin;

/* -------------------------------------------------------------------------- */
/* 1. Hunts                                                                   */
/* -------------------------------------------------------------------------- */

create table public.hunts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  player_id uuid not null references public.players (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  description text check (description is null or char_length(description) <= 200),
  /* Public is on the profile for anyone; private is the owner's alone.
     The same two words the rest of the profile uses. */
  visibility text not null default 'public' check (visibility in ('public', 'private'))
);

/* One name per player, whatever the case: "red luffy" and "Red Luffy"
   are the same folder, as the old label fold already treated them. */
create unique index hunts_player_name_idx
  on public.hunts (player_id, lower(btrim(name)));

create table public.hunt_requests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  hunt_id uuid not null references public.hunts (id) on delete cascade,
  card_id uuid not null references public.cards (id) on delete cascade,
  /* Null is any printing, the same default a Flare has. */
  printing_id uuid references public.card_printings (id) on delete set null,
  quantity_needed integer not null check (quantity_needed between 1 and 99),
  quantity_found integer not null default 0 check (quantity_found >= 0),
  position integer not null default 0
);

/* A card appears once per hunt, per printing preference. Wanting more
   of it is a bigger number, never a second row. */
create unique index hunt_requests_card_idx
  on public.hunt_requests (
    hunt_id,
    card_id,
    coalesce(printing_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );
create index hunt_requests_hunt_idx on public.hunt_requests (hunt_id, position);

alter table public.hunts enable row level security;
alter table public.hunt_requests enable row level security;
revoke all on public.hunts from anon, authenticated;
revoke all on public.hunt_requests from anon, authenticated;

/* -------------------------------------------------------------------------- */
/* 2. The post behind a batch                                                 */
/* -------------------------------------------------------------------------- */

create table public.flare_posts (
  /* The same id every flare in the batch carries in `posted_batch`. */
  id uuid primary key,
  created_at timestamptz not null default now(),
  player_id uuid references public.players (id) on delete cascade,
  player_session_id uuid references public.player_sessions (id) on delete set null,
  intent text not null default 'want' check (intent in ('want', 'showcase')),
  caption text check (caption is null or char_length(caption) <= 280),
  event_id uuid references public.events (id) on delete set null,
  posted_postal_code text,
  hunt_id uuid references public.hunts (id) on delete set null,
  published_at timestamptz not null default now()
);

create index flare_posts_player_idx on public.flare_posts (player_id, published_at desc);

alter table public.flare_posts enable row level security;
revoke all on public.flare_posts from anon, authenticated;

/* -------------------------------------------------------------------------- */
/* 3. What a flare gains                                                      */
/* -------------------------------------------------------------------------- */

/* `found_at` came from the hunt checklist migration (20261012090000).
   The backfill below reads it, so it is added here too, harmlessly, in
   case that migration was never run on this database. */
alter table public.flares
  add column if not exists found_at timestamptz;

alter table public.flares
  add column if not exists hunt_request_id uuid references public.hunt_requests (id) on delete set null,
  add column if not exists found_quantity integer not null default 0 check (found_quantity >= 0);

comment on column public.flares.hunt_request_id is
  'The hunt request this posted card answers. When set, the request holds the copies-found count and this row''s own count is ignored.';
comment on column public.flares.found_quantity is
  'Copies the owner has found of a card posted outside any hunt. Ignored when hunt_request_id is set.';

/* A lone post is a batch of one. The code has always meant this and the
   column became NOT NULL without a default, which a single-card insert
   tripped over. The default is the safety net; the code now sends one. */
alter table public.flares alter column posted_batch set default gen_random_uuid();

create index flares_hunt_request_idx on public.flares (hunt_request_id)
  where hunt_request_id is not null;

/* -------------------------------------------------------------------------- */
/* 4. An offer that carries several cards                                     */
/* -------------------------------------------------------------------------- */

alter table public.flare_responses
  add column if not exists offer_batch uuid;

comment on column public.flare_responses.offer_batch is
  'Shared by every line of one offer made together ("I have these three"). Null on an offer made on one card in a room.';

/* -------------------------------------------------------------------------- */
/* 5. Backfill: the hunts accounts already named                              */
/* -------------------------------------------------------------------------- */

insert into public.hunts (player_id, name, created_at)
select
  f.player_id,
  min(btrim(f.deck_label)),
  min(f.created_at)
from public.flares f
where f.player_id is not null
  and f.deck_label is not null
  and btrim(f.deck_label) <> ''
group by f.player_id, lower(btrim(f.deck_label));

insert into public.hunt_requests
  (hunt_id, card_id, printing_id, quantity_needed, quantity_found, created_at)
select
  h.id,
  f.card_id,
  f.printing_id,
  least(99, greatest(1, sum(f.quantity))),
  least(
    sum(f.quantity),
    sum(case when f.found_at is not null or f.status = 'traded' then f.quantity else 0 end)
  ),
  min(f.created_at)
from public.flares f
join public.hunts h
  on h.player_id = f.player_id
 and lower(h.name) = lower(btrim(f.deck_label))
where f.player_id is not null
  and f.deck_label is not null
  and f.status <> 'cancelled'
group by h.id, f.card_id, f.printing_id;

update public.flares f
set hunt_request_id = r.id
from public.hunts h
join public.hunt_requests r on r.hunt_id = h.id
where f.player_id = h.player_id
  and f.deck_label is not null
  and lower(h.name) = lower(btrim(f.deck_label))
  and r.card_id = f.card_id
  and r.printing_id is not distinct from f.printing_id;

/* A card ticked outside any hunt: all of its copies are found. */
update public.flares
set found_quantity = quantity
where found_at is not null
  and hunt_request_id is null;

/* -------------------------------------------------------------------------- */
/* 6. Backfill: a post for every batch                                        */
/* -------------------------------------------------------------------------- */

insert into public.flare_posts
  (id, created_at, published_at, player_id, player_session_id, intent, caption,
   event_id, posted_postal_code, hunt_id)
select distinct on (f.posted_batch)
  f.posted_batch,
  f.created_at,
  f.created_at,
  coalesce(f.player_id, s.player_id),
  f.player_session_id,
  f.intent,
  f.note,
  f.event_id,
  f.posted_postal_code,
  r.hunt_id
from public.flares f
left join public.player_sessions s on s.id = f.player_session_id
left join public.hunt_requests r on r.id = f.hunt_request_id
order by f.posted_batch, f.created_at;

commit;
