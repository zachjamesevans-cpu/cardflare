-- Offers: a holder's deliberate answer to a Flare.
--
-- Milestone 6 drew the privacy line: the board tells the *holder* privately
-- "you have this", and the holder's binder is never broadcast. This table is
-- the other half of that design — the moment a holder chooses to be found.
-- Responding writes one row; the requester then sees "this player can help,
-- and said 'table 12'". Nothing about the holder's binder travels with it:
-- not the printing they hold, not the quantity, not anything else in it. The
-- offer is a hand raised, not an inventory disclosure.
--
-- One offer per player per Flare, enforced by the unique index the
-- application upserts against — offering twice updates the message rather
-- than stacking rows. Withdrawing deletes the row: an offer that is no longer
-- open has no history worth keeping, and Milestone 8's trade records will be
-- their own table with their own lifecycle, not a status column bolted on
-- here.
--
-- `on delete cascade` everywhere, deliberately: a cancelled Flare keeps its
-- history (it is soft-cancelled, not deleted), but a *deleted* session or
-- event must take its offers with it, the same way it takes participation.

begin;

create table public.flare_responses (
  id uuid primary key default gen_random_uuid(),

  flare_id uuid not null references public.flares (id) on delete cascade,

  -- The player raising their hand. Never the flare's own author — enforced
  -- in the application, since a check constraint cannot look across to the
  -- flares table and a trigger is more machinery than the rule is worth. A
  -- self-offer that slipped through would advertise you to yourself, which
  -- is embarrassing rather than dangerous.
  responder_session_id uuid not null
    references public.player_sessions (id) on delete cascade,

  -- "Blue shirt by the counter", "table 12". Optional, short, and the only
  -- thing the responder says — everything else is a conversation in person.
  message text,

  created_at timestamptz not null default now(),

  constraint flare_responses_message_bounded
    check (message is null or char_length(message) <= 80)
);

comment on table public.flare_responses is
  'A holder''s offer to answer a Flare. Visible to the Flare''s author. Carries nothing from the responder''s binder.';

-- The upsert target: offering again replaces your message, never duplicates.
create unique index flare_responses_unique_idx
  on public.flare_responses (flare_id, responder_session_id);

-- The requester's read: every offer on a room's open Flares, via the flare.
-- The unique index above already serves flare_id-first lookups; this one
-- serves the responder side — withdrawing, and counting a player's open
-- offers for the cap.
create index flare_responses_responder_idx
  on public.flare_responses (responder_session_id);

/*
 * A guest session has no auth.uid(), so there is nothing for a policy to key
 * off — same stance as flares and player_cards: RLS on, zero policies, and
 * privileges revoked, so the table simply does not exist through the public
 * PostgREST API. Every read and write goes through the service role after
 * the server has proved possession of a player session.
 */
alter table public.flare_responses enable row level security;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on public.flare_responses from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on public.flare_responses from authenticated;
  end if;
end $$;

commit;
