-- Profiles, Embers, and the things Embers buy.
--
-- The founder's system, decided option by option:
--
--   * Only a CONFIRMED trade earns anything. Not posting, not turning
--     up, not pledging. The one act the whole product exists to cause
--     is the only one that pays.
--   * The currency is Embers.
--   * Two numbers, and this is the important one. `embers_earned` is a
--     lifetime total that only ever goes up: it is the badge, it is
--     public, and it says how much trading somebody has actually done.
--     `embers_balance` is what they have left to spend, it is private,
--     and buying something takes from it alone. A number that can go
--     down is a bad status signal; a status number you cannot spend is
--     a bad shop. Two numbers is how both stay honest.
--   * What Embers buy: card frames, holo patterns and animated effects
--     for the cards on a player's profile showcase.
--
-- Deliberately NOT a tradeable or purchasable currency. Embers cannot
-- be bought, gifted or transferred. The moment they can, the badge
-- stops meaning "this person trades" and starts meaning "this person
-- paid", and every anti-farming rule below becomes pointless.

begin;

/* -------------------------------------------------------------------------- */
/* 1. The profile itself, on the player it belongs to                          */
/* -------------------------------------------------------------------------- */

alter table public.players
  add column avatar_url text,
  add column embers_earned integer not null default 0,
  add column embers_balance integer not null default 0,
  -- Equipped cosmetics, by slug. Profile-wide rather than per card: a
  -- showcase is a shelf with one look, not nine separate decisions.
  add column equipped_frame text,
  add column equipped_holo text,
  add column equipped_effect text;

comment on column public.players.embers_earned is
  'Lifetime Embers, public, monotonic. The badge. Never decremented, not even by a refund.';
comment on column public.players.embers_balance is
  'Unspent Embers, private. Spending touches this and nothing else.';

/*
 * Neither number may go negative. The balance check is the one that
 * matters: it is what makes "can this player afford it" a question the
 * database answers rather than one the application is trusted to ask.
 */
alter table public.players
  add constraint players_embers_earned_sane check (embers_earned >= 0),
  add constraint players_embers_balance_sane check (embers_balance >= 0);

/* -------------------------------------------------------------------------- */
/* 2. The catalogue                                                            */
/* -------------------------------------------------------------------------- */

create table public.cosmetics (
  slug text primary key check (slug ~ '^[a-z0-9-]{2,40}$'),
  kind text not null check (kind in ('frame', 'holo', 'effect')),
  name text not null check (char_length(name) between 1 and 60),
  description text not null check (char_length(description) between 1 and 200),

  -- What it costs to buy. Zero means it is free to everyone.
  cost_embers integer not null default 0 check (cost_embers >= 0),

  -- A lifetime-earned floor, for things that should read as "you have
  -- put the work in" rather than "you saved up". Null means no floor.
  requires_earned integer check (requires_earned >= 0),

  sort_order integer not null default 0
);

comment on table public.cosmetics is
  'What Embers buy. Seeded here, not user-generated: the look of the app is not a user input.';

alter table public.cosmetics enable row level security;

create table public.player_cosmetics (
  player_id uuid not null references public.players (id) on delete cascade,
  cosmetic_slug text not null references public.cosmetics (slug) on delete cascade,
  acquired_at timestamptz not null default now(),
  primary key (player_id, cosmetic_slug)
);

comment on table public.player_cosmetics is
  'PURCHASED cosmetics only. A free item needs no row: cost_embers = 0 means everybody owns it, which is what keeps a brand new player from starting with an empty wardrobe and no way to equip anything.';

alter table public.player_cosmetics enable row level security;

/* -------------------------------------------------------------------------- */
/* 3. The ledger                                                               */
/* -------------------------------------------------------------------------- */

/*
 * Every movement, earned or spent, with the thing that caused it.
 *
 * `ref` is the idempotency key and the reason this table exists at all.
 * Confirming a trade is already retry-safe on the trades table, and a
 * retry must not pay twice — so the award is keyed to the trade, and a
 * second attempt hits this unique index instead of the balance.
 */
create table public.ember_ledger (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  player_id uuid not null references public.players (id) on delete cascade,

  reason text not null check (reason in ('trade', 'purchase', 'grant')),

  -- Positive on an award, zero on a spend: lifetime never decreases.
  earned_delta integer not null default 0 check (earned_delta >= 0),
  -- Positive on an award, negative on a spend.
  balance_delta integer not null,

  -- 'trade:<trade_id>', 'purchase:<player_id>:<slug>', 'grant:<what>'.
  ref text not null,

  note text
);

create unique index ember_ledger_ref_idx on public.ember_ledger (ref);
create index ember_ledger_player_idx on public.ember_ledger (player_id, created_at desc);

alter table public.ember_ledger enable row level security;

/* -------------------------------------------------------------------------- */
/* 4. The profile showcase                                                     */
/* -------------------------------------------------------------------------- */

/*
 * Cards on a player's own shelf, as opposed to the room-scoped
 * showcases on `flares`. A room showcase says "I will let this go
 * tonight"; this says "this is what I am proud of", which is a
 * different sentence and outlives the event.
 */
create table public.player_showcase (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  player_id uuid not null references public.players (id) on delete cascade,
  card_id uuid not null references public.cards (id) on delete cascade,
  printing_id uuid references public.card_printings (id) on delete set null,
  position integer not null default 0
);

create unique index player_showcase_unique_idx
  on public.player_showcase (player_id, card_id, printing_id)
  nulls not distinct;

create index player_showcase_player_idx
  on public.player_showcase (player_id, position);

alter table public.player_showcase enable row level security;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on public.cosmetics from anon;
    revoke all on public.player_cosmetics from anon;
    revoke all on public.ember_ledger from anon;
    revoke all on public.player_showcase from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on public.cosmetics from authenticated;
    revoke all on public.player_cosmetics from authenticated;
    revoke all on public.ember_ledger from authenticated;
    revoke all on public.player_showcase from authenticated;
  end if;
end $$;

/* -------------------------------------------------------------------------- */
/* 5. Awarding, atomically                                                     */
/* -------------------------------------------------------------------------- */

/*
 * Ledger row and balances in one statement, so a crash between the two
 * cannot leave a player paid but unrecorded, or recorded but unpaid.
 *
 * Returns false when the ref has been seen before, which is what makes
 * a retried trade confirmation free.
 */
create function public.award_embers(
  target_player uuid,
  amount integer,
  award_reason text,
  award_ref text,
  award_note text default null
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  if amount <= 0 then
    return false;
  end if;

  insert into public.ember_ledger (player_id, reason, earned_delta, balance_delta, ref, note)
  values (target_player, award_reason, amount, amount, award_ref, award_note)
  on conflict (ref) do nothing;

  if not found then
    return false;
  end if;

  update public.players
     set embers_earned = embers_earned + amount,
         embers_balance = embers_balance + amount
   where id = target_player;

  return true;
end;
$function$;

/*
 * Spending. The `embers_balance >= cost` in the WHERE clause is the
 * whole guard: two taps on Buy race each other into the same row, and
 * the second one updates nothing rather than going negative.
 */
create function public.spend_embers(
  target_player uuid,
  cost integer,
  spend_ref text,
  spend_note text default null
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  spent integer;
begin
  if cost < 0 then
    return false;
  end if;

  /*
   * Three guards in one statement, and all three have to be here.
   *
   * `embers_balance >= cost` is affordability. The `not exists` is
   * idempotency, and it belongs in the WHERE rather than in a check
   * before it: two taps on Buy race into the same row, the second
   * blocks on the row lock, and when it wakes it re-reads this
   * condition against the first one's now-committed ledger row and
   * matches nothing. Charging twice for one purchase was the bug the
   * first version had — the ledger conflicted and did nothing while
   * the balance had already been taken twice.
   */
  update public.players
     set embers_balance = embers_balance - cost
   where id = target_player
     and embers_balance >= cost
     and not exists (select 1 from public.ember_ledger where ref = spend_ref)
  returning embers_balance into spent;

  if spent is null then
    return false;
  end if;

  insert into public.ember_ledger (player_id, reason, earned_delta, balance_delta, ref, note)
  values (target_player, 'purchase', 0, -cost, spend_ref, spend_note);

  return true;
end;
$function$;

revoke all on function public.award_embers(uuid, integer, text, text, text) from public;
revoke all on function public.spend_embers(uuid, integer, text, text) from public;

/* -------------------------------------------------------------------------- */
/* 6. The opening catalogue                                                    */
/* -------------------------------------------------------------------------- */

insert into public.cosmetics (slug, kind, name, description, cost_embers, requires_earned, sort_order)
values
  ('plain',        'frame',  'Plain',        'No frame. Every player starts here.',                     0, null,  0),
  ('ember-edge',   'frame',  'Ember Edge',   'A warm rule around the card.',                          150, null, 10),
  ('lime-edge',    'frame',  'Lime Edge',    'The CardFlare accent, drawn thin.',                     300, null, 20),
  ('prism-edge',   'frame',  'Prism Edge',   'A border that shifts as it catches the light.',         600,  200, 30),

  ('none-holo',    'holo',   'Matte',        'No holo. The card as it is.',                             0, null,  0),
  ('classic-holo', 'holo',   'Classic Holo', 'The even sheen of a standard foil.',                    200, null, 10),
  ('prism-holo',   'holo',   'Prism Holo',   'Two rainbows crossing, the way real foil reads.',       450, null, 20),
  ('galaxy-holo',  'holo',   'Galaxy Holo',  'Deep and starry, for the card you never trade.',        800,  300, 30),

  ('still',        'effect', 'Still',        'No movement.',                                            0, null,  0),
  ('shimmer',      'effect', 'Shimmer',      'A slow travelling highlight.',                          350, null, 10),
  ('pulse',        'effect', 'Pulse',        'The frame breathes, once every few seconds.',           500, null, 20),
  ('orbit',        'effect', 'Orbit',        'A light that circles the card. Rare, and it shows.',    900,  500, 30);

/*
 * No seeding of the free items, deliberately.
 *
 * The first cut handed every existing player a row for each zero-cost
 * cosmetic, and a probe caught what that misses: a player created
 * afterwards gets nothing, because a migration runs once. Free is a
 * property of the item, not a row somebody owns — so `cost_embers = 0`
 * means everybody has it, forever, including whoever signs up tonight.
 *
 * Equipped columns stay null for the same reason. Null reads as "the
 * free default", which needs no backfill and cannot drift.
 */

/* -------------------------------------------------------------------------- */
/* 7. Avatars                                                                  */
/* -------------------------------------------------------------------------- */

/*
 * A public bucket, because an avatar is shown to a room full of
 * strangers by design. Guarded on the storage schema existing so this
 * migration still applies against a bare PostgreSQL used for probing.
 *
 * Writes go through the service role only: the application resizes and
 * re-encodes before storing, so nothing a client sends is ever served
 * back verbatim.
 */
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('avatars', 'avatars', true, 2097152,
            array['image/png', 'image/jpeg', 'image/webp'])
    on conflict (id) do update
      set public = true,
          file_size_limit = 2097152,
          allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp'];
  end if;
end $$;

commit;
