-- How somebody wants the Feed drawn.
--
-- The founder: "lets develop a few 'views' for the feed, that can be
-- changed under settings in the profile. this is the orignal view,
-- let's make a compact view... one flare takes up the whole screen
-- right now pretty much."
--
-- ON THE PLAYER, not the device. A view is a preference about reading,
-- and somebody who picks Compact on their phone has said something
-- about how they read - not about that handset. The room already
-- follows the account across platforms for the same reason.
--
-- Text with a check rather than an enum: a new view is then a one-line
-- constraint change instead of an ALTER TYPE, and "a few views" is
-- explicitly where this is going.
begin;

alter table public.players
  add column if not exists feed_view text not null default 'classic';

alter table public.players
  drop constraint if exists players_feed_view_check;

alter table public.players
  add constraint players_feed_view_check
    check (feed_view in ('classic', 'compact'));

comment on column public.players.feed_view is
  'How this player wants the Feed drawn: classic (the original card) or '
  'compact (card art and a needed-count, with everything else contextual). '
  'Unknown values are impossible by constraint; an older client that does '
  'not recognise the value falls back to classic.';

commit;
