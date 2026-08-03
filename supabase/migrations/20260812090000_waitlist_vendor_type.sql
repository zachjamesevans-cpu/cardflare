-- The waitlist meets the second kind of operator.
--
-- Card-show vendors became a first-class audience in the card-shows
-- milestone, and the landing page now speaks to them — so the waitlist has
-- to let them say what they are. Postgres 12+ allows adding an enum value
-- inside a transaction so long as the same transaction does not use it, and
-- nothing below does.

begin;

alter type public.waitlist_user_type add value if not exists 'vendor';

commit;
