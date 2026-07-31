-- CardFlare beta foundations: admins, stores, and store invitations.
--
-- Security model, in short:
--   * Identity comes from Supabase Auth. Every policy below keys off auth.uid().
--   * Admins are an explicit allow-list table. Membership is never self-service.
--   * A store's members can read their own store and nothing else.
--   * Invites are readable by nobody through the public API. They are consumed
--     server-side, by the service role, during the first sign-in.
--
-- The waitlist table from Milestone 1 keeps its own model (RLS on, zero
-- policies, service-role writes only) and is untouched here.

create type public.store_status as enum ('invited', 'active', 'paused');
create type public.store_role as enum ('owner', 'staff');

-- ---------------------------------------------------------------------------
-- Admins
-- ---------------------------------------------------------------------------

create table public.admin_users (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  note text
);

comment on table public.admin_users is
  'CardFlare staff. Rows are added out-of-band (SQL editor), never by the app.';

alter table public.admin_users enable row level security;

/*
 * Admin lookup used by policies on other tables.
 *
 * SECURITY DEFINER so it can read admin_users while that table itself stays
 * unreadable, and so an admin policy on another table does not recurse back
 * into a policy on this one. search_path is pinned because a definer function
 * that resolves names through the caller's search_path is a privilege
 * escalation waiting to happen.
 */
create function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.admin_users where user_id = auth.uid()
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

create policy "admins read the admin list"
  on public.admin_users for select
  to authenticated
  using (public.is_admin());

-- ---------------------------------------------------------------------------
-- Stores
-- ---------------------------------------------------------------------------

create table public.stores (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null,
  contact_email text not null,
  city text,
  region text,
  status public.store_status not null default 'invited',
  -- Distinguishes beta participants from stores that arrive after launch, so
  -- pilots and general availability can share one database.
  is_pilot boolean not null default true,

  constraint stores_name_length check (char_length(btrim(name)) between 1 and 120),
  constraint stores_contact_email_is_normalized
    check (contact_email = lower(btrim(contact_email))),
  constraint stores_contact_email_shape
    check (contact_email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  constraint stores_city_length check (city is null or char_length(city) <= 80),
  constraint stores_region_length check (region is null or char_length(region) <= 80)
);

create index stores_created_at_idx on public.stores (created_at desc);

alter table public.stores enable row level security;

-- ---------------------------------------------------------------------------
-- Store membership
-- ---------------------------------------------------------------------------

create table public.store_members (
  store_id uuid not null references public.stores (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.store_role not null default 'owner',
  created_at timestamptz not null default now(),

  primary key (store_id, user_id)
);

create index store_members_user_id_idx on public.store_members (user_id);

alter table public.store_members enable row level security;

/*
 * Membership lookup, for the same reasons as is_admin(): a policy on stores
 * that queried store_members directly would trigger store_members' own
 * policies, which in turn reference stores.
 */
create function public.is_store_member(target_store_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
      from public.store_members
     where store_id = target_store_id
       and user_id = auth.uid()
  );
$$;

revoke all on function public.is_store_member(uuid) from public;
grant execute on function public.is_store_member(uuid) to authenticated;

create policy "members and admins read a store"
  on public.stores for select
  to authenticated
  using (public.is_admin() or public.is_store_member(id));

create policy "members and admins read store membership"
  on public.store_members for select
  to authenticated
  using (public.is_admin() or user_id = auth.uid());

-- No insert, update or delete policies anywhere above. Stores are created and
-- modified by the admin console through the service role, which bypasses RLS.
-- Adding a write policy here would let any signed-in store edit its own row.

-- ---------------------------------------------------------------------------
-- Invitations
-- ---------------------------------------------------------------------------

/*
 * A pending claim on a store, keyed by email address.
 *
 * There is deliberately no invitation token. Supabase Auth already proves
 * control of an inbox via its magic link, so a second homegrown secret would
 * add cryptography to maintain without adding security. On first sign-in the
 * server looks for an unaccepted invite matching the verified email and binds
 * the account to the store.
 */
create table public.store_invites (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores (id) on delete cascade,
  email text not null,
  created_at timestamptz not null default now(),
  invited_by uuid references auth.users (id) on delete set null,
  accepted_at timestamptz,
  accepted_by uuid references auth.users (id) on delete set null,

  constraint store_invites_email_is_normalized
    check (email = lower(btrim(email))),
  constraint store_invites_email_shape
    check (email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  constraint store_invites_accepted_together
    check ((accepted_at is null) = (accepted_by is null))
);

-- One live invite per address. Accepted invites are kept for the audit trail,
-- so the uniqueness only covers those still outstanding.
create unique index store_invites_pending_email_key
  on public.store_invites (email)
  where accepted_at is null;

create index store_invites_store_id_idx on public.store_invites (store_id);

alter table public.store_invites enable row level security;

-- No policies at all: invites are never read through the public API. They are
-- consumed by the server during sign-in, using the service role.

revoke all on table public.store_invites from anon, authenticated;
