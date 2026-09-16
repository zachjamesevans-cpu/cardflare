-- A hunt is a checklist you can tick.
--
-- The founder: "needs to be a simply way in hunts to mark off if you've
-- already found that card. think of it as a checklist, others can help
-- you check those things off, or you can check them off yourself as you
-- collect the cards."
--
-- This reverses a rule the hunts panel was built on - "nothing is
-- checked off by hand" - and the reversal is right. That rule assumed
-- every card arrives through a CardFlare trade, and most do not: you
-- pull one, a friend hands you one, you buy one at the counter. A
-- checklist that only a trade could tick was a checklist that was wrong
-- about most of its own boxes.
--
-- A NEW COLUMN RATHER THAN status = 'traded'. A trade is a thing that
-- happened between two people here: it writes a `trades` row, tells the
-- other person, and shows up in the Feed as "X traded with Y". Ticking a
-- box means "I have this now", which is a smaller and different claim.
-- Reusing the trade status would have invented trades that never
-- happened and put them in somebody's history.
--
-- So a hunt card is FOUND when either is true - the trade closed it, or
-- the owner ticked it - and the two never have to be kept in step
-- because neither is derived from the other.
begin;

/* -------------------------------------------------------------------------- */
/* Ticked by hand: "I have this now"                                          */
/* -------------------------------------------------------------------------- */

/* Null is the unticked box. A timestamp rather than a boolean because
   "when did you get it" is the question anybody asks next, and a
   boolean cannot be made to answer it later. */
alter table public.flares
  add column if not exists found_at timestamptz;

comment on column public.flares.found_at is
  'Set when the owner ticks the card off in a hunt: they have it now. '
  'Distinct from status = ''traded'', which means a trade completed here '
  'and wrote a trades row. A card is found when either is true.';

/* The hunts panel reads every labelled Flare for one player and folds
   them into folders. That read is keyed on the player and the label; the
   tick only ever rides along with it, so no index of its own. */

commit;
