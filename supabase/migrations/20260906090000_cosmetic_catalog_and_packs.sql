-- The catalog behind the curtain, and the sets that will let it out.
--
-- Everything CardFlare sells has so far been live the moment it existed.
-- The founder's plan needs the opposite: a large catalog written now,
-- kept invisible, and released a set at a time through packs he builds
-- in the console. Three things have to exist for that.
--
-- 1. cosmetics.status. 'draft' is invisible to players everywhere -
--    not in the store, not in a wardrobe, not in a pack pool, and NOT
--    in the unlock-all grant. 'live' is what ships. Everything that
--    exists today is live, because it already is.
--
-- 2. New kinds for the new catalog. The live catalog's kinds (frame,
--    holo, effect) are deliberately NOT reused: the founder's lists
--    contain a Galaxy card border, a Prism holo pattern and a Pulse
--    animation, and the live catalog already has a Galaxy frame, a
--    Prism holo and a Pulse effect. Same names, different art, and the
--    (kind, name) unique index would reject them. Giving the new
--    catalog its own kinds keeps both, touches nothing anyone owns,
--    and reads honestly: 'frame' is the nine shipped borders, 'border'
--    is the catalog of card borders waiting for a set.
--
-- 3. pack_series and pack_series_items. Packs have lived in code
--    (src/lib/packs/origin). Sets the founder builds live here instead,
--    with a release date, their own art, and per-item weights he sets.
--    Code series and database series coexist; nothing about Origin
--    changes.

begin;

-- 1. Draft or live -----------------------------------------------------

alter table public.cosmetics
  add column if not exists status text not null default 'live'
    check (status in ('live', 'draft'));

create index if not exists cosmetics_status_idx on public.cosmetics (status);

comment on column public.cosmetics.status is
  'live: buyable, ownable, grantable. draft: exists only in the admin console.';

-- 2. The new catalog's kinds -------------------------------------------

alter table public.cosmetics
  drop constraint cosmetics_kind_check;

alter table public.cosmetics
  add constraint cosmetics_kind_check
    check (kind in (
      -- shipped and live
      'frame', 'holo', 'effect',
      -- the catalog
      'ring',       -- profile borders, around the avatar
      'border',     -- card borders
      'pattern',    -- holo patterns
      'animation',  -- card animations and effects
      'background', -- showcase backgrounds
      'scene',      -- profile-page effects
      'nameplate',  -- how a username is drawn
      'title',      -- the line under a username
      'badge'       -- the little mark beside one
    ));

-- 3. Sets built in the console -----------------------------------------

create table if not exists public.pack_series (
  slug text primary key
    check (slug ~ '^[a-z0-9-]{2,40}$'),
  name text not null
    check (char_length(name) between 1 and 60),
  set_number integer not null
    check (set_number > 0),
  description text not null default ''
    check (char_length(description) <= 300),
  price_embers integer not null default 300
    check (price_embers >= 0),
  slots integer not null default 3
    check (slots between 1 and 10),
  /* Null means "not scheduled". A future date means the set exists but
     is not on sale yet - the shop reads this, not a person's memory. */
  release_at timestamptz,
  /* Storage object path for the pack's art, or null for the default
     CardFlare wrapper. */
  art_path text
    check (art_path is null or char_length(art_path) <= 300),
  status text not null default 'draft'
    check (status in ('live', 'draft')),
  created_at timestamptz not null default now()
);

create table if not exists public.pack_series_items (
  series_slug text not null
    references public.pack_series (slug) on delete cascade,
  cosmetic_slug text not null
    references public.cosmetics (slug) on delete cascade,
  rarity text not null default 'common'
    check (rarity in ('common', 'uncommon', 'rare', 'epic', 'legendary')),
  /* Draw weight in percent. The console shows the running total and
     refuses to publish a set that does not reach 100; it is not a check
     constraint because a set is built one item at a time and would be
     unbuildable if every intermediate state had to be valid. */
  weight numeric(6, 3) not null default 1
    check (weight > 0 and weight <= 100),
  primary key (series_slug, cosmetic_slug)
);

create index if not exists pack_series_items_series_idx
  on public.pack_series_items (series_slug);

-- Read models only ever run through the service role (the console and
-- the packs API), exactly like `cosmetics`. No policies, RLS on, so a
-- browser key cannot read an unreleased set out of the database.
alter table public.pack_series enable row level security;
alter table public.pack_series_items enable row level security;

comment on table public.pack_series is
  'Packs built in the admin console. Code-defined series (Origin) are separate.';

-- 4. The second grant ---------------------------------------------------
--
-- `cosmetics_unlocked` has always meant "owns everything, including
-- things added later". With a draft catalog that promise becomes a leak:
-- the founder wants those kept behind the scenes, and every unlocked
-- player would be wearing them tomorrow.
--
-- So it keeps its meaning but narrows to LIVE cosmetics only, and a
-- second flag covers the catalog. Only the founder's own account is
-- meant to carry it; the console labels it accordingly.

alter table public.players
  add column if not exists cosmetics_unlocked_draft boolean not null default false;

comment on column public.players.cosmetics_unlocked is
  'Owns every LIVE cosmetic, including ones added later.';
comment on column public.players.cosmetics_unlocked_draft is
  'Also owns draft (behind-the-scenes) cosmetics. Admin use only.';

commit;
