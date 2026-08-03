-- Card shows: vendors, booths, and inventory attendees can search.
--
-- The second kind of operator. A game store runs rooms where players trade
-- with each other; a card-show vendor brings stock to a booth and wants to
-- be *found*. Both arrive through the same invitation pipeline and the same
-- sign-in — `stores.kind` is the one switch that changes what their
-- dashboard is for.
--
-- A show is its own thing, not an event: it belongs to no store, it hosts
-- many vendors, and its code is scanned by people who never join anything.
-- Its join code is EIGHT characters, extending the split-by-length scheme
-- (six = event, seven = counter code) so the same scanned URL can never
-- resolve to the wrong kind of thing.
--
-- Inventory rows carry the vendor's two physical realities: raw singles and
-- graded slabs. A slab is the same card in a case with a grade on it — PSA,
-- BGS, CGC — and which one it is decides whether an attendee walks to the
-- booth. **No prices anywhere**, per PRODUCT.md: CardFlare says who has the
-- card and where they are sitting; the number on the sticker is booth talk.

begin;

/* -------------------------------------------------------------------------- */
/* 1. Two kinds of operator                                                   */
/* -------------------------------------------------------------------------- */

create type public.store_kind as enum ('lgs', 'vendor');

-- Default 'lgs' so every existing store keeps meaning what it meant.
alter table public.stores
  add column kind public.store_kind not null default 'lgs';

comment on column public.stores.kind is
  'lgs runs rooms and events; vendor brings inventory to card-show booths.';

/* -------------------------------------------------------------------------- */
/* 2. Shows                                                                   */
/* -------------------------------------------------------------------------- */

create table public.shows (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,

  name text not null,
  city text,
  region text,

  -- Same shape rule as stores.timezone, and validated the same way: the set
  -- that matters is the one Intl honours, checked in the application.
  timezone text not null default 'UTC',

  starts_at timestamptz not null,
  ends_at timestamptz not null,

  -- Eight characters: the third length in the code namespace.
  join_code text not null,

  constraint shows_name_bounded check (char_length(name) between 1 and 120),
  constraint shows_city_bounded check (city is null or char_length(city) <= 80),
  constraint shows_region_bounded check (region is null or char_length(region) <= 80),
  constraint shows_timezone_shape check (timezone ~ '^[A-Za-z0-9_+/-]{3,64}$'),
  constraint shows_window_sane check (ends_at > starts_at),
  constraint shows_join_code_shape check (join_code ~ '^[0-9A-HJKMNP-TV-Z]{8}$')
);

comment on table public.shows is
  'A card show: many vendors, one scannable code. Attendees search inventory against it without joining anything.';

create unique index shows_join_code_idx on public.shows (join_code);
create index shows_window_idx on public.shows (starts_at desc);

/* -------------------------------------------------------------------------- */
/* 3. Vendors at a show                                                       */
/* -------------------------------------------------------------------------- */

create table public.show_vendors (
  show_id uuid not null references public.shows (id) on delete cascade,
  store_id uuid not null references public.stores (id) on delete cascade,

  -- "A12", "215", "Corner 3". A booth number is what the attendee writes on
  -- the back of their hand, so it is short and plain by constraint.
  booth text not null,

  created_at timestamptz not null default now(),

  -- One booth claim per vendor per show; claiming again updates the booth.
  primary key (show_id, store_id),

  constraint show_vendors_booth_shape
    check (booth ~ '^[A-Za-z0-9][A-Za-z0-9 .-]{0,11}$')
);

comment on table public.show_vendors is
  'A vendor''s booth at one show. The row is the vendor saying "I will be there, here".';

/* -------------------------------------------------------------------------- */
/* 4. Inventory                                                               */
/* -------------------------------------------------------------------------- */

create type public.inventory_form as enum ('raw', 'slab');

create table public.vendor_inventory (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  store_id uuid not null references public.stores (id) on delete cascade,
  card_id uuid not null references public.cards (id) on delete cascade,

  -- Null means the vendor did not say which printing — same meaning as the
  -- binder, same cascade: catalog resyncs own printing rows.
  printing_id uuid references public.card_printings (id) on delete cascade,

  form public.inventory_form not null default 'raw',

  -- The grading company, uppercase initials: PSA, BGS, CGC. A shape check
  -- rather than an enum, because grading companies appear faster than
  -- migrations should have to.
  grader text,

  -- 1–10 in half steps is every mainstream scale. Null on a slab means the
  -- case says "Authentic" rather than a number.
  grade numeric(3, 1),

  quantity integer not null default 1,

  constraint vendor_inventory_quantity_sane check (quantity between 1 and 999),
  constraint vendor_inventory_grader_shape
    check (grader is null or grader ~ '^[A-Z]{2,8}$'),
  constraint vendor_inventory_grade_sane
    check (grade is null or (grade >= 1 and grade <= 10)),

  -- A raw card has no grader and no grade; a slab always names its grader.
  constraint vendor_inventory_slab_shape check (
    (form = 'raw' and grader is null and grade is null)
    or (form = 'slab' and grader is not null)
  )
);

comment on table public.vendor_inventory is
  'What a vendor is bringing: raw singles and graded slabs. No prices, per PRODUCT.md — the number on the sticker is booth talk.';

/*
 * One row per distinct physical thing: the same card can appear raw, as a
 * PSA 10, and as a BGS 9.5, and those are three rows. Restating one of them
 * replaces its quantity, which is what "uploading inventory before the show"
 * means in practice.
 */
create unique index vendor_inventory_unique_idx
  on public.vendor_inventory (store_id, card_id, printing_id, form, grader, grade)
  nulls not distinct;

-- The attendee's hot path: card ids from search, filtered to a show's vendors.
create index vendor_inventory_card_idx on public.vendor_inventory (card_id);
create index vendor_inventory_store_idx on public.vendor_inventory (store_id);

/* -------------------------------------------------------------------------- */
/* 5. Same security stance as every table before them                         */
/* -------------------------------------------------------------------------- */

alter table public.shows enable row level security;
alter table public.show_vendors enable row level security;
alter table public.vendor_inventory enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['shows', 'show_vendors', 'vendor_inventory'] loop
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('revoke all on public.%I from anon', t);
    end if;
    if exists (select 1 from pg_roles where rolname = 'authenticated') then
      execute format('revoke all on public.%I from authenticated', t);
    end if;
  end loop;
end $$;

commit;
