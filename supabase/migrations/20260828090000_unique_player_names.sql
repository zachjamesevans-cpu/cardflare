-- One account, one name.
--
-- The founder's rule: "no two people can have the same username when
-- they have a full account. Guest usernames are fine and aren't stored"
-- — and that split is exactly right. A guest's name lives on
-- `player_sessions`, expires with it, and only ever has to tell six
-- people at a counter apart for one evening. An account's name is how
-- somebody is looked up, so it has to mean one person.
--
-- Case-insensitive, because "Chunc" and "chunc" are the same person to
-- everyone except a database, and a lookup that misses on capitalisation
-- is a lookup nobody trusts.

begin;

/* -------------------------------------------------------------------------- */
/* 1. Tidy up what is already there                                            */
/* -------------------------------------------------------------------------- */

/*
 * Names were never unique before, so there may be collisions in the
 * pilot. Adding the index without dealing with them first would simply
 * fail and leave the whole feature unshippable.
 *
 * The oldest account keeps the name — first come, first served is the
 * only rule that does not need a judgement call — and everyone else gets
 * a numeric suffix. Loud on purpose: a player who finds themselves
 * called "Zach2" will ask, which is the correct outcome. Silently
 * renaming somebody to something unguessable would not be.
 */
/*
 * Trim FIRST, then suffix. A probe caught the other order: "  CHUNC  "
 * became "CHUNC  3", with the padding baked into the middle of the name
 * where no later trim could reach it. Whitespace is not part of anyone's
 * name, so it goes before any other decision is made about the string.
 */
update public.players
   set display_name = btrim(display_name)
 where display_name <> btrim(display_name);

with ranked as (
  select
    id,
    display_name,
    row_number() over (
      partition by lower(display_name)
      order by created_at, id
    ) as position
  from public.players
)
update public.players as p
   set display_name = left(ranked.display_name, 38) || ranked.position::text
  from ranked
 where p.id = ranked.id
   and ranked.position > 1;

/* -------------------------------------------------------------------------- */
/* 2. The rule itself                                                          */
/* -------------------------------------------------------------------------- */

/*
 * On the expression rather than the column, which is what makes it
 * case-insensitive without a citext dependency. The application lower()s
 * the same way when it checks availability, so the two agree.
 */
create unique index players_display_name_unique
  on public.players (lower(display_name));

comment on index public.players_display_name_unique is
  'One account per name, case-insensitive. Guests are unaffected: their names live on player_sessions and are never unique.';

/*
 * No blank or whitespace-only names. A unique index would happily allow
 * exactly one of those, which is one more than should exist.
 */
alter table public.players
  add constraint players_display_name_present
  check (btrim(display_name) = display_name and char_length(display_name) between 1 and 40);

commit;
