-- Two things an account needs that it did not have: a way for an admin
-- to hand out Embers and permanent unlocks, and a record of whether the
-- player has actually finished setting themselves up.

begin;

/* -------------------------------------------------------------------------- */
/* 1. Unlock everything, forever                                               */
/* -------------------------------------------------------------------------- */

/*
 * A flag rather than a pile of `player_cosmetics` rows, and the founder's
 * own words are what decide it: "any frames and such are always
 * unlocked, forever".
 *
 * Granting rows would only unlock what exists today. A cosmetic added
 * next month would appear locked to somebody who was told they had
 * everything, and nobody would think to go back and re-grant. A flag
 * covers the catalogue as it grows, which is what "forever" means.
 *
 * Deliberately NOT a subscription tier or a Pro perk. This is an admin
 * switch for the founder, testers and the occasional goodwill fix.
 */
alter table public.players
  add column cosmetics_unlocked boolean not null default false;

comment on column public.players.cosmetics_unlocked is
  'Admin grant: owns every cosmetic, including ones added later. Not a purchase, not a tier.';

/* -------------------------------------------------------------------------- */
/* 2. Has this player finished setting up?                                     */
/* -------------------------------------------------------------------------- */

/*
 * Null means they have an account but have never chosen a username or a
 * picture — the state a brand new sign-in lands in.
 *
 * A timestamp rather than a boolean because it answers a second question
 * for free: when. "Signed up three weeks ago and never finished" is a
 * thing worth being able to see, and a boolean cannot say it.
 */
alter table public.players
  add column onboarded_at timestamptz;

comment on column public.players.onboarded_at is
  'When the player finished choosing a username and picture. Null means setup is still owed.';

/*
 * Everyone who already exists is done, backfilled from when they joined.
 *
 * Without this, shipping the setup screen would ambush every pilot player
 * with a wizard for an account they have been using for weeks. New
 * accounts start null and see it; nobody else does.
 */
update public.players
   set onboarded_at = created_at
 where onboarded_at is null;

/* -------------------------------------------------------------------------- */
/* 3. Granting Embers WITHOUT touching the badge                               */
/* -------------------------------------------------------------------------- */

/*
 * The founder's correction, and it is the right one: "If I give someone
 * (myself) embers, I don't want someone to go on my profile and see
 * that I have a ton of embers I didn't actually earn."
 *
 * `award_embers` moves both numbers, which is correct for a trade and
 * wrong for a gift. This moves the spendable balance only and writes
 * `earned_delta = 0`, so the public badge keeps meaning exactly one
 * thing: trades this person actually did. A separate function rather
 * than a flag on the other one, because the two have different
 * invariants and a boolean argument is how somebody eventually passes
 * the wrong one.
 *
 * The ledger already had the shape for this — `earned_delta` and
 * `balance_delta` were always separate columns.
 */
create function public.grant_embers(
  target_player uuid,
  amount integer,
  grant_ref text,
  grant_note text default null
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
  values (target_player, 'grant', 0, amount, grant_ref, grant_note)
  on conflict (ref) do nothing;

  if not found then
    return false;
  end if;

  -- Balance only. The badge is not for sale and not for giving away.
  update public.players
     set embers_balance = embers_balance + amount
   where id = target_player;

  return true;
end;
$function$;

revoke all on function public.grant_embers(uuid, integer, text, text) from public;

/* -------------------------------------------------------------------------- */
/* 4. Finding a player by name, from the console                               */
/* -------------------------------------------------------------------------- */

/*
 * The admin search is `display_name ilike '%thing%'`, which cannot use a
 * b-tree index. Trigram can, and `pg_trgm` is already installed for card
 * search — so this costs one index and no new dependency.
 *
 * Overkill for a pilot's worth of players and deliberately built now
 * anyway: this is the query that gets slow first as the table grows, and
 * adding it later means noticing the slowness first.
 */
create index players_display_name_trgm_idx
  on public.players using gin (display_name gin_trgm_ops);

commit;
