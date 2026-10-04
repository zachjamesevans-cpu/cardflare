-- The reminder on the day of a night.
--
-- Saying Going, days ahead, is the easy half. The hard half is the
-- morning of: a player who said Going on Tuesday has forgotten by
-- Friday what the board looks like and which cards to put in the bag.
-- One notice, on the day, with the two numbers that matter (matches on
-- the board, cards to bring), or a nudge to post a Flare when nothing
-- has matched yet. Sent once per night per player by a daily cron, so
-- it needs a kind of its own on the notifications row.

begin;

alter table public.notifications
  drop constraint if exists notifications_kind_check;

alter table public.notifications
  add constraint notifications_kind_check
    check (kind in (
      'offer-received',
      'trade-confirmed',
      'early-board',
      'board-open',
      'new-follower',
      'room-flare',
      'message-received',
      'nearby-match',
      'post-comment',
      'store-post',
      'night-match',
      'night-reminder'
    ));

commit;
