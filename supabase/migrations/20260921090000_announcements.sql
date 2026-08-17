-- The one thing on the Feed that a person writes.
--
-- Everything else there is derived: a board is open or it is not, a
-- friend posted a Flare or they did not, and nobody can put a word in
-- front of a player that the data did not already say. That is what
-- keeps the Feed honest, and it is also why a brand-new player on the
-- quietest Tuesday of the year can open it to nothing at all.
--
-- OP-17 lands this week and there is something to say about it. The
-- founder's idea, in their words: "maybe everyone has one following
-- when they first load the app, and it's the official cardflare
-- account, which has posts that will populate the feed already."
--
-- Deliberately NOT that. A CardFlare player row would be a fake person:
-- followable, unfollowable, with a binder it never fills and a handle
-- somebody could report. It would also lie in the one place the product
-- is strict, since every other face on the Feed belongs to somebody who
-- actually stood in a shop. So this is its own table, it wears the mark
-- rather than an avatar, and it cannot be followed because there is
-- nobody there.
--
-- The expiry is not optional and there is no default. A system notice
-- with no end date is how a feed rots: OP-17 week is news on Thursday
-- and clutter a fortnight later, and the person who wrote it will have
-- stopped looking long before then. Writing one means saying when it
-- stops being true.

begin;

create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  -- Who wrote it, for the console's own list. Kept if they ever leave:
  -- the notice is CardFlare's, not theirs.
  created_by uuid references auth.users (id) on delete set null,
  headline text not null,
  body text not null,
  -- A place to send them, or nothing. Both halves or neither: a button
  -- with no label is invisible and a label with no button is a lie.
  link_label text,
  link_href text,
  starts_at timestamptz not null default now(),
  expires_at timestamptz not null,

  constraint announcements_headline_length
    check (char_length(headline) between 1 and 80),
  constraint announcements_body_length
    check (char_length(body) between 1 and 400),
  constraint announcements_link_pair check (
    (link_label is null and link_href is null)
    or (
      link_label is not null
      and link_href is not null
      and char_length(link_label) between 1 and 40
    )
  ),
  /*
   * Our own paths only. This is the single surface on the Feed where
   * text is typed rather than derived, which makes it the single place
   * an off-origin link could be aimed at every player at once. A
   * leading slash is the whole rule; `//evil.example` is a protocol
   * relative URL and is refused with it.
   */
  constraint announcements_link_internal check (
    link_href is null or (link_href like '/%' and link_href not like '//%')
  ),
  constraint announcements_window check (expires_at > starts_at)
);

comment on table public.announcements is
  'Notices from CardFlare shown on the Feed. Authored, expiring, and not a player.';

comment on column public.announcements.expires_at is
  'When it stops showing. Required: a system notice with no end date is how a feed rots.';

/*
 * The Feed asks one question of this table — "what is showing right
 * now" — and asks it on every render of the busiest screen we have.
 */
create index announcements_showing_idx
  on public.announcements (expires_at desc, starts_at desc);

alter table public.announcements enable row level security;

/*
 * No policies, like every other table a guest session reaches. A player
 * on the Feed may have no auth.uid() at all, so authorisation is the
 * session cookie checked server-side and the read goes through the
 * service role.
 */
revoke all on public.announcements from anon;
revoke all on public.announcements from authenticated;

commit;
