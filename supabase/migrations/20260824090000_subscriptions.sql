-- Subscriptions: the money table, ahead of any purchase surface.
--
-- Three tiers, two owner shapes. CardFlare Pro belongs to a player;
-- CardFlare Ultra and CardFlare Max belong to a store row, because a
-- vendor IS a store with kind = 'vendor' (Milestone 9's one-switch
-- design). The check constraint makes an orphan or a double-owner row
-- unrepresentable, and the partial unique indexes hold every owner to
-- one subscription at a time.
--
-- Two payment sources from day one: Stripe for the web, Apple for the
-- app's in-app purchases (players buying Pro on an iPhone must go
-- through Apple). Whichever source writes the row, the entitlement
-- readers see one shape — features gate on tier and status, never on
-- who processed the card.
--
-- No prices anywhere in this schema, deliberately: prices live in
-- Stripe price objects and App Store products, referenced by id from
-- server environment variables.

begin;

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  tier text not null check (tier in ('pro', 'ultra', 'max')),

  -- Exactly one owner, and the right kind of owner for the tier.
  player_id uuid references public.players (id) on delete cascade,
  store_id uuid references public.stores (id) on delete cascade,
  constraint subscriptions_owner_matches_tier check (
    (tier = 'pro' and player_id is not null and store_id is null)
    or (tier in ('ultra', 'max') and store_id is not null and player_id is null)
  ),

  source text not null check (source in ('stripe', 'apple')),
  status text not null check (status in ('active', 'trialing', 'past_due', 'canceled')),

  stripe_customer_id text,
  stripe_subscription_id text unique,
  apple_original_transaction_id text unique,

  -- Paid-through moment, for the grace window on past_due and the
  -- tail of a cancel-at-period-end.
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false
);

-- One live subscription per owner, whichever source sold it.
create unique index subscriptions_player_uniq
  on public.subscriptions (player_id) where player_id is not null;
create unique index subscriptions_store_uniq
  on public.subscriptions (store_id) where store_id is not null;

alter table public.subscriptions enable row level security;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on public.subscriptions from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on public.subscriptions from authenticated;
  end if;
end $$;

commit;
