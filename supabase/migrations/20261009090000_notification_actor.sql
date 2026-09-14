-- Who did the thing, so the inbox can show their face.
--
-- The founder, with Instagram's notifications beside the app's: every
-- row there leads with the person's picture, and ours led with a line
-- of text. A notification is almost always somebody doing something -
-- following you, offering on your Flare, posting in your room, sending
-- a message - and the row had their name baked into the title with no
-- way back to who they are.
--
-- `actor_id` is that way back. Nullable, because a board opening at a
-- store has no person behind it; set null on delete, because the notice
-- that Kaito followed you is still true after Kaito closes the account,
-- it just loses its face. Recorded alongside the row rather than parsed
-- back out of the title, which is what a display name change would
-- otherwise break.

begin;

alter table public.notifications
  add column actor_id uuid references public.players (id) on delete set null;

commit;
