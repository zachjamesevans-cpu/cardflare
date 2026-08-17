-- A handle to be found by, a name to be seen as.
--
-- The founder: "I don't think people should be able to have a space on
-- their username... Perhaps something similar to discord where they get
-- a random set of numbers after their username?"
--
-- Discord tried the numbers and dropped them in 2023, for the reason
-- that decides it here: you cannot say "Zach#62847" out loud across a
-- game store, and a friend request that fails on a typo is a friend
-- request that does not happen. What they moved TO is what this does —
-- one unique handle with no spaces in it, and one display name that is
-- allowed to be anything.
--
-- So the two jobs one column was doing get split:
--
--   handle        unique, lowercase, [a-z0-9_], 3-20. The address.
--   display_name  whatever they want. What a room shows. NOT unique.
--
-- Dropping uniqueness from display_name is the point, not a side
-- effect. Today one person on the whole platform can be called "Zach"
-- and everybody after them is refused; the handle is what has to be
-- unique, and a name never did.

begin;

/* -------------------------------------------------------------------------- */
/* 1. The column                                                               */
/* -------------------------------------------------------------------------- */

alter table public.players add column if not exists handle text;

/* -------------------------------------------------------------------------- */
/* 2. What a handle is allowed to be                                           */
/* -------------------------------------------------------------------------- */

/*
 * Written as a function because three separate things need to agree on
 * it: this migration's backfill, any later backfill, and the reader
 * trying to work out why their name became what it became. The
 * application mirrors it in `handleFrom`, and a unit test walks the same
 * cases through both.
 *
 * Lowercase because a handle that differs only in capitals is not a
 * different handle to any human being. Underscore for anything that is
 * not a letter or a digit, which is exactly the founder's ask: "if
 * they're gonna do a space it should be an underscore".
 */
create or replace function public.handle_from(candidate text)
returns text
language sql
immutable
as $$
  select
    /* 4. Give up to twenty characters, never ending on a separator. */
    rtrim(
      left(
        /* 3. No leading or trailing underscores. */
        btrim(
          /* 2. One underscore, however many characters were replaced. */
          regexp_replace(
            /* 1. Everything that is not a letter or a digit becomes one. */
            regexp_replace(lower(coalesce(candidate, '')), '[^a-z0-9]+', '_', 'g'),
            '_+', '_', 'g'
          ),
          '_'
        ),
        20
      ),
      '_'
    );
$$;

comment on function public.handle_from(text) is
  'Lowercases a name into a candidate handle: separators become one underscore, trimmed, capped at 20. Not unique on its own — the caller resolves collisions.';

/* -------------------------------------------------------------------------- */
/* 3. Backfill                                                                 */
/* -------------------------------------------------------------------------- */

/*
 * Oldest account wins the plain handle, exactly as the name migration
 * decided ties. A player who ends up as `zach2` can change it; a player
 * who cannot sign in because the backfill refused is a support ticket.
 *
 * `handle_from` can return something too short — a name of "!!" leaves
 * nothing at all — so anything under three characters falls back to the
 * word "player" and lets the numbering below make it unique. Deliberately
 * boring: an unguessable handle derived from a row id would be worse
 * than one that obviously wants changing.
 */
with candidate as (
  select
    id,
    case
      when char_length(public.handle_from(display_name)) >= 3
        then public.handle_from(display_name)
      else 'player'
    end as base,
    created_at
  from public.players
  where handle is null
),
ranked as (
  select
    id,
    base,
    row_number() over (partition by base order by created_at, id) as position
  from candidate
)
update public.players as p
   set handle = case
                  when ranked.position = 1 then ranked.base
                  /* Trim the base so base+suffix still fits in twenty. */
                  else left(ranked.base, 20 - char_length(ranked.position::text))
                       || ranked.position::text
                end
  from ranked
 where p.id = ranked.id;

/*
 * A second pass, because the first can still collide: a player already
 * holding `zach2` from an earlier run of this migration would clash with
 * the `zach2` the numbering just produced. Loops until nothing moves,
 * which terminates because every pass strictly increases the suffix.
 */
do $$
declare
  moved integer;
  guard integer := 0;
begin
  loop
    with duplicated as (
      select
        id,
        handle,
        row_number() over (partition by handle order by created_at, id) as position
      from public.players
      where handle is not null
    )
    update public.players as p
       set handle = left(duplicated.handle, 19) || duplicated.position::text
      from duplicated
     where p.id = duplicated.id
       and duplicated.position > 1;

    get diagnostics moved = row_count;
    exit when moved = 0;

    guard := guard + 1;
    if guard > 10 then
      raise exception 'Could not settle handle collisions after 10 passes';
    end if;
  end loop;
end $$;

/* -------------------------------------------------------------------------- */
/* 4. The rules                                                                */
/* -------------------------------------------------------------------------- */

alter table public.players alter column handle set not null;

do $$ begin
  alter table public.players
    add constraint players_handle_shape
    check (handle ~ '^[a-z0-9_]{3,20}$');
exception
  when duplicate_object then null;
end $$;

comment on constraint players_handle_shape on public.players is
  'Lowercase letters, digits and underscores, 3-20. No spaces, so a handle can be said out loud, typed without ambiguity and put in a URL.';

/*
 * A plain unique index, not a lower() one: the shape constraint above
 * means a handle is already lowercase, so there is no case to fold.
 */
create unique index if not exists players_handle_unique
  on public.players (handle);

comment on index public.players_handle_unique is
  'One account per handle. This is the identity display_name used to carry.';

/* -------------------------------------------------------------------------- */
/* 5. Give the display name its freedom back                                   */
/* -------------------------------------------------------------------------- */

/*
 * The whole reason for the split. Two people called "Zach" is not a
 * problem once @zach and @zach_b tell them apart, and refusing the
 * second one was never defensible — a name is not an address.
 *
 * The presence constraint stays: still trimmed, still one to forty
 * characters, still never blank.
 */
drop index if exists public.players_display_name_unique;

/*
 * Searching by handle wants the same trigram index the name has, so
 * "zac" finds @zach_b rather than only an exact hit.
 */
create index if not exists players_handle_trgm_idx
  on public.players using gin (handle gin_trgm_ops);

commit;
