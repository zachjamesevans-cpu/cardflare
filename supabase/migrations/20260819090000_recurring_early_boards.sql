-- Recurring events, and boards that open before the doors do.
--
-- The founder ran the experiment by hand at the Wednesday beta: he shared
-- the room link a few hours early, and seventeen players knew what to
-- bring from home. This migration is that experiment made permanent.
--
-- Two facts, each stored once:
--
--   * events.repeat_weekly — "Mox runs One Piece every Wednesday" is a fact
--     about the store, not something an employee should re-enter each week.
--     When a recurring occurrence closes, the application creates the next
--     one seven days later (same wall-clock time in the store's zone, so a
--     6pm event stays a 6pm event across DST) as a fresh draft.
--
--   * stores.early_board_hours — how long before start the board accepts
--     Flares. Pre-posted Flares are clearly marked as from players still on
--     their way, and are cancelled at close if the poster never showed: the
--     board must never claim a person is in a room they are not in. Zero
--     turns early boards off for stores that find a pre-filled room
--     confusing at the counter.

begin;

alter table public.events
  add column repeat_weekly boolean not null default false;

comment on column public.events.repeat_weekly is
  'When true, closing this occurrence creates the next one, +7 days.';

alter table public.stores
  add column early_board_hours integer not null default 48
    check (early_board_hours between 0 and 168);

comment on column public.stores.early_board_hours is
  'Hours before start that a scheduled board accepts Flares. 0 = off.';

commit;
