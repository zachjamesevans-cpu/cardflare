-- Nights: rooms open when a night is posted; Going; night matches.
--
-- The founder (2026-10-03): "What if, you just say you're going to an
-- event. Or a tournament night. That room stays 'open' and anyone can
-- go into there and see who is looking for which cards before the
-- tournament or event starts."
--
-- Nothing new to store. Going is an event_participants row, the same
-- row a scan at the counter writes, so "who is going" and "who is in
-- the room" are one list. The only schema change is one more kind of
-- notice: a night match, told before the night rather than at the
-- table. Same list as before, plus 'night-match'.
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
      'night-match'
    ));

commit;
