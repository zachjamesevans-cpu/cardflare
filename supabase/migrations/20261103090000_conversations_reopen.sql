-- Every ended conversation opens again.
--
-- Either side used to be able to end a conversation, and an ended one
-- took no more messages, ever, from anywhere: not the thread, not the
-- Message button on a profile. The founder, locked out of writing to a
-- friend: "Messages should act more like instagram DM's. I can't even
-- message her again because it says the convo is closed."
--
-- Conversations do not end now; the block is the one way to stop
-- somebody, and it closes every door in both directions. The column
-- stays (nothing reads it as a refusal), and this clears it so the
-- threads that were ended read as the open conversations they are.
-- Blocked pairs stay unable to write: that check is the block's own.

begin;

update public.flare_threads
  set closed_at = null,
      closed_by = null
  where closed_at is not null;

commit;
