-- One room identity per account.
--
-- The bug, reported from a real room: joining from the mobile site and then
-- from the app, signed in as the same account, put the founder's name on the
-- board twice. Each client holds its own session token, each token resolved to
-- its own `player_sessions` row, and `event_participants` is keyed on the
-- session — so two devices meant two people.
--
-- The duplicate on the board is only the visible half. Everything room-scoped
-- hangs off the session id: the binder, the Flares, the offers. Two sessions
-- for one account means two binders, and a player who listed a card on their
-- phone would not match with it in the app.
--
-- A session is a DEVICE. An account is a PERSON. This migration makes the
-- session belong to the person:
--
--   1. `player_session_tokens` lets one session answer to several tokens, so a
--      second device can be handed the identity the account already has
--      instead of minting a rival one. Nothing is rotated and nobody is signed
--      out — the first device's token keeps working, because it is still a
--      token for the same session.
--   2. `merge_player_sessions` folds one session into another, conflict by
--      conflict, and carries the source's token across so the device holding
--      it never notices.
--   3. Accounts that already have several sessions are merged into their
--      oldest, and a partial unique index makes a second one impossible.
--
-- Guests are untouched throughout. A guest has no `player_id`, so the index
-- ignores them, and their one token still resolves the way it always did.
--
-- Every step is written to survive a second run. The first attempt at the
-- pilot database aborted part way through the fold — one transaction, so
-- nothing landed — and a migration that cannot simply be pasted again after
-- a fix is a migration you are afraid of.

begin;

/* -------------------------------------------------------------------------- */
/* 1. A session can answer to more than one token                             */
/* -------------------------------------------------------------------------- */

create table if not exists public.player_session_tokens (
  -- SHA-256 of a session token, lowercase hex. Never the token itself, for
  -- the same reason `player_sessions.token_hash` is a hash: read access to
  -- this table must not let anyone resume a session.
  token_hash text primary key,

  player_session_id uuid not null
    references public.player_sessions (id) on delete cascade,

  created_at timestamptz not null default now(),

  constraint player_session_tokens_hash_shape
    check (token_hash ~ '^[0-9a-f]{64}$')
);

comment on table public.player_session_tokens is
  'Extra tokens that resolve to a player session. One identity, several devices: an account joining from a second client adopts the session it already has rather than creating a second one.';

create index if not exists player_session_tokens_session_idx
  on public.player_session_tokens (player_session_id);

alter table public.player_session_tokens enable row level security;

/*
 * No policies, exactly as on `player_sessions`.
 *
 * These rows ARE the credential store. A guest has no auth.uid() to key a
 * policy off, so authorisation is possession of the token and every lookup
 * goes through the service role.
 */
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on public.player_session_tokens from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on public.player_session_tokens from authenticated;
  end if;
end
$$;

/* -------------------------------------------------------------------------- */
/* 2. Folding one session into another                                        */
/* -------------------------------------------------------------------------- */

/*
 * Every table keyed on a session, in one statement each: collapse what would
 * collide, then re-point what is left. Doing it the other way round — moving
 * first and repairing after — fails on the unique indexes half way through and
 * leaves the player with pieces of two identities.
 *
 * `security definer` with a pinned `search_path`, like `is_admin()` and
 * `award_embers`: it is called by the service role only, and a definer
 * function resolving names through the caller's path is an escalation route.
 */
create or replace function public.merge_player_sessions(source uuid, target uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if source is null or target is null or source = target then
    return;
  end if;

  /*
   * The source's own token becomes an alias for the target, first, so that
   * the device holding it keeps working through the rest of this. Losing it
   * would sign somebody out mid-event to fix a duplicate they never saw.
   */
  insert into public.player_session_tokens (token_hash, player_session_id)
  select s.token_hash, target from public.player_sessions s where s.id = source
  on conflict (token_hash)
    do update set player_session_id = excluded.player_session_id;

  update public.player_session_tokens
     set player_session_id = target
   where player_session_id = source;

  /*
   * The binder. The larger quantity wins and the newer confirmation stands —
   * the same rule the portable Have List used when it collapsed per-event
   * rows, and for the same reason: understating a binder loses matches, while
   * overstating one only costs a conversation.
   */
  update public.player_cards t
     set quantity = greatest(t.quantity, s.quantity),
         confirmed_at = greatest(t.confirmed_at, s.confirmed_at),
         note = coalesce(t.note, s.note)
    from public.player_cards s
   where s.player_session_id = source
     and t.player_session_id = target
     and t.card_id = s.card_id
     and t.printing_id is not distinct from s.printing_id;

  delete from public.player_cards s
   where s.player_session_id = source
     and exists (
       select 1 from public.player_cards t
        where t.player_session_id = target
          and t.card_id = s.card_id
          and t.printing_id is not distinct from s.printing_id);

  update public.player_cards
     set player_session_id = target
   where player_session_id = source;

  /*
   * Flares. The same ask from both devices is one ask — and when only one of
   * the two is still open, that is the one that survives. Dropping the open
   * row in favour of a cancelled duplicate would quietly take a card off the
   * board that the player is still hunting.
   *
   * `intent` is part of the uniqueness key, so it is part of the comparison:
   * wanting a card and showing the same one off are two different rows and
   * must stay that way.
   */
  delete from public.flares t
   where t.player_session_id = target
     and t.status <> 'open'
     and exists (
       select 1 from public.flares s
        where s.player_session_id = source
          and s.status = 'open'
          and s.event_id = t.event_id
          and s.card_id = t.card_id
          and s.intent = t.intent
          and s.printing_id is not distinct from t.printing_id);

  delete from public.flares s
   where s.player_session_id = source
     and exists (
       select 1 from public.flares t
        where t.player_session_id = target
          and t.event_id = s.event_id
          and t.card_id = s.card_id
          and t.intent = s.intent
          and t.printing_id is not distinct from s.printing_id);

  update public.flares
     set player_session_id = target
   where player_session_id = source;

  -- Offers: one "come find me" per Flare per person, whichever device said it.
  delete from public.flare_responses s
   where s.responder_session_id = source
     and exists (
       select 1 from public.flare_responses t
        where t.responder_session_id = target
          and t.flare_id = s.flare_id);

  update public.flare_responses
     set responder_session_id = target
   where responder_session_id = source;

  /*
   * An offer the player made on their own Flare from their other device.
   * The split is the only way one could exist — the application has always
   * refused a self-offer — and once the two halves are one person it would
   * advertise them to themselves. Deleted rather than carried over, and
   * deliberately after the moves above, so it catches the pairs that only
   * became self-offers by being merged.
   */
  delete from public.flare_responses r
   using public.flares f
   where r.flare_id = f.id
     and r.responder_session_id = target
     and f.player_session_id = target;

  /*
   * Room membership. The earlier arrival and the later sighting both survive,
   * which keeps `last_seen_at >= joined_at` true by construction rather than
   * by luck — the check constraint on that table is not negotiable.
   */
  update public.event_participants t
     set joined_at = least(t.joined_at, s.joined_at),
         last_seen_at = greatest(t.last_seen_at, s.last_seen_at),
         open_to_trades = t.open_to_trades or s.open_to_trades
    from public.event_participants s
   where s.player_session_id = source
     and t.player_session_id = target
     and t.event_id = s.event_id;

  delete from public.event_participants s
   where s.player_session_id = source
     and exists (
       select 1 from public.event_participants t
        where t.player_session_id = target
          and t.event_id = s.event_id);

  update public.event_participants
     set player_session_id = target
   where player_session_id = source;

  /*
   * A trade recorded between the two halves of one person.
   *
   * Found by the founder's own data, not by review: he had confirmed a
   * Flare against an offer his other device had made on it, which the
   * split made possible and `trades_not_self` forbids the moment the two
   * sessions become one. Re-pointing both columns raised 23514 and took
   * the whole migration down with it.
   *
   * The partner is dropped and the trade stays. That is a shape the table
   * already has — "a trade with somebody who never tapped offer is
   * recorded partnerless" — and it is the honest one here, because there
   * was never a second person. Deleting it instead would shrink a store's
   * history, which is the one thing these rows are not allowed to do.
   */
  update public.trades
     set holder_session_id = null
   where requester_session_id in (source, target)
     and holder_session_id in (source, target);

  -- History survives its pointers, so a store's numbers do not shrink.
  update public.trades set requester_session_id = target where requester_session_id = source;
  update public.trades set holder_session_id = target where holder_session_id = source;

  /*
   * The account keeps whichever name the surviving session carries; the join
   * writes the account's own name over it on the way in regardless.
   */
  delete from public.player_sessions where id = source;
end;
$$;

comment on function public.merge_player_sessions(uuid, uuid) is
  'Folds one player session into another: binder, Flares, offers, memberships and trades, collapsing duplicates rather than failing on them. The source''s token survives as an alias, so the device holding it is not signed out.';

revoke all on function public.merge_player_sessions(uuid, uuid) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on function public.merge_player_sessions(uuid, uuid) from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on function public.merge_player_sessions(uuid, uuid) from authenticated;
  end if;
end
$$;

/* -------------------------------------------------------------------------- */
/* 3. Accounts that already have two, and never again                         */
/* -------------------------------------------------------------------------- */

/*
 * The oldest session is the one kept, because it is the one most likely to
 * hold the binder that has been building up. Merging in creation order also
 * makes the result independent of which device happens to run first.
 */
do $$
declare
  account record;
  extra uuid;
begin
  for account in
    select player_id, (array_agg(id order by created_at, id))[1] as keep
      from public.player_sessions
     where player_id is not null
     group by player_id
    having count(*) > 1
  loop
    for extra in
      select id from public.player_sessions
       where player_id = account.player_id and id <> account.keep
       order by created_at, id
    loop
      perform public.merge_player_sessions(extra, account.keep);
    end loop;
  end loop;
end
$$;

-- What the whole migration is for: an account cannot have a second identity.
create unique index if not exists player_sessions_one_per_account_idx
  on public.player_sessions (player_id)
  where player_id is not null;

comment on index public.player_sessions_one_per_account_idx is
  'One room identity per account. A second device adopts the existing session through player_session_tokens instead of creating a rival one.';

commit;
