-- CardFlare demo seed: a believable evening at one store, for App Store
-- screenshots.
--
-- NEVER run this against production. It is for a throwaway demo
-- Supabase project whose only accounts are the thirteen made by the
-- screenshot script: hero@demo.cardflare.gg and cast01 to cast12 at the
-- same domain. Everything below hangs off those accounts and off one
-- fictional store, Grand Line Games in Austin, TX.
--
-- What it sets up, screen by screen, and what each one reads:
--
--   Room      A scheduled night at Grand Line Games that opened an hour
--             ago and runs three more (events, status open). The hero
--             and eleven cast members are seated (event_participants,
--             one player_sessions row each, linked to the account), with
--             Flares on the board (flares, intent want or showcase) and
--             Have lists (player_cards, local_trade). Arranged so other
--             players want cards the hero holds (the green ring) and
--             hold cards the hero wants, four of them both ways.
--   Feed      Area Flares (flares with no event, player_id set) from
--             players the hero follows, each with its post row
--             (flare_posts, id = the flares' posted_batch), hearts and
--             a short thread (flare_post_likes, flare_post_comments),
--             minutes to hours old. Plus two posts from the store.
--   Binder    The hero's "Trade binder" (binders, for_trade) with 22
--             cards in exact pockets (binder_cards.position, 0 to 8 is
--             page one), mirrored into the Have list the way
--             syncTradeCard keeps it. Two private binders beside it.
--   Profile   players.tier = 'pro', cosmetics owned (player_cosmetics,
--             plus the draft grant, see below) and worn (player_equips
--             and the legacy equipped_* columns), a dressed showcase
--             (player_showcase), followers and following
--             (player_follows), and the One Piece game chip
--             (player_games).
--   Messages  A direct conversation with Jordan (flare_threads with no
--             anchor, flare_messages) about a swap, ending in a
--             confirmed "We traded" (trades with thread_id, acknowledged),
--             and two quieter conversations so the list is not lonely.
--   Store     Four upcoming nights over the coming week (events, status
--             draft), hours, games, a description, and Going counts.
--
-- Times are all relative to now(), so the room is live whenever this
-- runs. Presence in a room is "seen in the last fifteen minutes"
-- (PRESENCE_WINDOW_MS), so take the Room screenshot within about ten
-- minutes of running this, or run it again.
--
-- Cards come from the real One Piece catalogue, imported before this
-- runs. Every card is named by canonical_card_number and reached through
-- a join, so a number the catalogue does not have is skipped rather than
-- written as a null. The count that resolved is reported at the end.
-- No printing is named anywhere: every column that can name one is
-- nullable, and "any printing" is what a player usually posts.
--
-- No prices anywhere. Terms are trade, or trade or cash, and never an
-- amount. No profile pictures: every face falls back to its initial.
--
-- Safe to run again and again: the first section deletes everything the
-- last run made. Plain SQL, one transaction, no psql meta-commands, so a
-- Node Postgres driver can send it as one string. The hero's display
-- name comes from the demo.hero_name setting, 'Zach' when unset:
--
--   set demo.hero_name = 'Zach';   -- before this file, optional

begin;

-- ----------------------------------------------------------------------
-- 0. Who and what
-- ----------------------------------------------------------------------

/* The thirteen people. Slot 0 is the hero, whose name and handle are
   worked out below from the setting. The rest are invented locals:
   ordinary names, nobody anyone has heard of. ring is the profile
   border a Pro cast member wears, so the room has colour in it. */
create temp table demo_cast (
  slot int primary key,
  email text not null,
  display_name text,
  handle text,
  pronouns text,
  bio text,
  tier text not null,
  ring text,
  postal_code text not null,
  joined_days_ago int not null,
  embers_earned int not null,
  embers_balance int not null
) on commit drop;

insert into demo_cast values
  (0,  'hero@demo.cardflare.gg',   null,              null,         null,     'Red Shanks at Grand Line Games. Secrets and alt arts. Always up for a swap.', 'pro',  null,            '78704', 142, 2140, 460),
  (1,  'cast01@demo.cardflare.gg', 'Maya Ortiz',      'mayaplays',  'she/her', 'Big Mom main. Will trade anything for a Yamato.',                          'pro',  'ring-inferno',  '78704', 188, 1620, 210),
  (2,  'cast02@demo.cardflare.gg', 'Dev Patel',       'devdraws',   null,      'Draws card art, plays purple Luffy. Trade binder always open.',             'free', null,            '78702', 121,  940, 120),
  (3,  'cast03@demo.cardflare.gg', 'Jordan Kim',      'jkim_op',    'he/him',  'Locals every week at Grand Line. Collecting secrets.',                      'free', null,            '78745', 167, 1310, 340),
  (4,  'cast04@demo.cardflare.gg', 'Luis Hernandez',  'luis_tcg',   null,      'Whitebeard enjoyer. Ask me about OP02.',                                    'pro',  'ring-sakura',   '78741',  96,  780,  60),
  (5,  'cast05@demo.cardflare.gg', 'Priya Nair',      'priyanair',  'she/her', 'Purple Luffy and good coffee.',                                             'free', null,            '78751',  74,  520,  90),
  (6,  'cast06@demo.cardflare.gg', 'Tyler Brooks',    'tbrooks',    null,      'Store champ hopeful. Red Shanks.',                                          'pro',  'ring-frozen',   '78723', 203, 2480, 730),
  (7,  'cast07@demo.cardflare.gg', 'Sofia Reyes',     'sofiareyes', 'she/her', 'Building Sabo one Ace at a time.',                                          'free', null,            '78704',  58,  410,  40),
  (8,  'cast08@demo.cardflare.gg', 'Marcus Webb',     'marcuswebb', null,      'Zoro collector. Every printing.',                                           'free', null,            '78757', 133,  860, 150),
  (9,  'cast09@demo.cardflare.gg', 'Hana Sato',       'hanasato',   'she/her', 'Nami decks only.',                                                          'pro',  'ring-electric', '78701', 112, 1150, 280),
  (10, 'cast10@demo.cardflare.gg', 'Caleb Turner',    'calebt',     null,      'Trading down my starter deck pile.',                                        'free', null,            '78745',  41,  230,  30),
  (11, 'cast11@demo.cardflare.gg', 'Nia Johnson',     'niaj_op',    'she/her', 'New to One Piece, building Vivi.',                                          'free', null,            '78702',  19,  120,  20),
  (12, 'cast12@demo.cardflare.gg', 'Owen Fischer',    'owenfish',   null,      'Judge on weekends, trader always.',                                         'free', null,            '78751', 155,  990, 175);

/* The hero's name: the demo.hero_name setting, or Zach. Trimmed and cut
   to the 40 characters players.display_name allows. */
update demo_cast
   set display_name = left(btrim(coalesce(
         nullif(btrim(current_setting('demo.hero_name', true)), ''),
         'Zach')), 40)
 where slot = 0;
update demo_cast set display_name = btrim(display_name) where slot = 0;

/* The hero's handle, the way handleSeedFrom would make one: the name's
   letters and digits, lower case, at most 20. Too short to be a handle
   (under 3) and it becomes hero_demo. Taken by somebody who is not a
   demo account (there should be nobody) and it gets a suffix. */
update demo_cast
   set handle = coalesce(
         nullif(left(lower(regexp_replace(display_name, '[^A-Za-z0-9_]+', '', 'g')), 20), ''),
         'hero_demo')
 where slot = 0;
update demo_cast set handle = 'hero_demo' where slot = 0 and char_length(handle) < 3;
update demo_cast d
   set handle = left(d.handle, 17) || '_cf'
 where d.slot = 0
   and (exists (select 1 from demo_cast o where o.slot <> 0 and o.handle = d.handle)
        or exists (
          select 1 from public.players p
            join auth.users u on u.id = p.user_id
           where p.handle = d.handle
             and lower(u.email) not like '%@demo.cardflare.gg'));

/* Every card number this file uses, about forty well-known ones from
   OP01 to OP09, the starter decks and EB01. The names are for whoever
   reads this file; the catalogue's own names are what the app shows. */
create temp table demo_card_list (num text primary key) on commit drop;
insert into demo_card_list (num) values
  -- Leaders
  ('OP01-001'), -- Roronoa Zoro
  ('OP01-003'), -- Monkey.D.Luffy
  ('OP01-060'), -- Donquixote Doflamingo
  ('OP01-061'), -- Kaido
  ('OP02-001'), -- Edward.Newgate
  ('OP03-001'), -- Portgas.D.Ace
  ('OP03-040'), -- Nami
  ('OP03-077'), -- Charlotte Linlin
  ('OP03-099'), -- Charlotte Katakuri
  ('OP04-001'), -- Nefeltari Vivi
  ('OP05-001'), -- Sabo
  ('OP05-060'), -- Monkey.D.Luffy
  ('OP09-001'), -- Shanks
  ('ST01-001'), -- Monkey.D.Luffy
  ('ST13-003'), -- Monkey.D.Luffy
  ('EB01-001'), -- Kouzuki Oden
  -- Characters, the chase cards among them
  ('OP01-016'), -- Nami
  ('OP01-025'), -- Roronoa Zoro
  ('OP01-047'), -- Trafalgar Law
  ('OP01-051'), -- Eustass"Captain"Kid
  ('OP01-078'), -- Boa Hancock
  ('OP01-120'), -- Shanks, the OP01 secret
  ('OP01-121'), -- Yamato, the OP01 secret
  ('OP02-004'), -- Edward.Newgate
  ('OP02-013'), -- Portgas.D.Ace
  ('OP03-112'), -- Charlotte Pudding
  ('OP03-122'), -- Sogeking, the OP03 secret
  ('OP04-118'), -- Nefeltari Vivi, the OP04 secret
  ('OP05-069'), -- Trafalgar Law
  ('OP05-119'), -- Monkey.D.Luffy, the Gear 5 secret
  ('OP06-118'), -- Roronoa Zoro, the OP06 secret
  ('OP06-119'), -- Sanji
  ('OP07-051'), -- Boa Hancock
  ('OP08-118'), -- an OP08 secret
  ('OP09-004'), -- Shanks
  ('OP09-118'), -- Gol.D.Roger, the OP09 secret
  ('OP09-119'), -- Monkey.D.Luffy, the OP09 secret
  ('ST01-012'), -- Monkey.D.Luffy
  ('ST01-013'), -- Roronoa Zoro
  ('ST15-002'); -- Edward.Newgate

/* The numbers the catalogue actually has. Everything below joins
   through this, so a missing number quietly drops out. */
create temp table demo_cards on commit drop as
select l.num, c.id as card_id
  from demo_card_list l
  join public.cards c
    on c.game = 'one-piece'
   and c.canonical_card_number = l.num;

-- ----------------------------------------------------------------------
-- 1. Clear the last run
-- ----------------------------------------------------------------------

/* Every player the demo accounts have, whatever id an earlier run (or a
   sign-in) gave them. */
create temp table demo_old_players on commit drop as
select p.id
  from public.players p
  join auth.users u on u.id = p.user_id
 where lower(u.email) like '%@demo.cardflare.gg';

create temp table demo_old_sessions on commit drop as
select s.id
  from public.player_sessions s
 where s.player_id in (select id from demo_old_players);

/* The demo store, found by its counter code or its name and town, and
   any night still holding one of the demo's event codes. */
create temp table demo_old_stores on commit drop as
select s.id
  from public.stores s
 where s.join_code = 'GRNDTX7'
    or (lower(s.name) = 'grand line games' and s.city = 'Austin');

create temp table demo_old_events on commit drop as
select e.id
  from public.events e
 where e.store_id in (select id from demo_old_stores)
    or e.join_code in ('SHANKS', 'GEAR5X', 'ACE3TX', 'YAMATX', 'SABTX5');

/* Trades first. A trade in a conversation has no event, and deleting
   the conversation would null its thread_id and break
   trades_has_a_place, so they go before anything they point at. */
delete from public.trades t
 where t.requester_player_id in (select id from demo_old_players)
    or t.holder_player_id in (select id from demo_old_players)
    or t.proposed_by in (select id from demo_old_players)
    or t.requester_session_id in (select id from demo_old_sessions)
    or t.holder_session_id in (select id from demo_old_sessions)
    or t.event_id in (select id from demo_old_events)
    or t.thread_id in (
      select f.id from public.flare_threads f
       where f.author_player_id in (select id from demo_old_players)
          or f.responder_player_id in (select id from demo_old_players));

/* Hearts and comments hang off a post id with no foreign key (a post is
   a player's flare_posts row or a store's store_posts row), so they are
   cleared by post as well as by who left them. */
delete from public.flare_post_likes l
 where l.player_id in (select id from demo_old_players)
    or l.post_id in (select id from public.flare_posts where player_id in (select id from demo_old_players))
    or l.post_id in (select id from public.store_posts where store_id in (select id from demo_old_stores));

delete from public.flare_post_comments c
 where c.player_id in (select id from demo_old_players)
    or c.post_id in (select id from public.flare_posts where player_id in (select id from demo_old_players))
    or c.post_id in (select id from public.store_posts where store_id in (select id from demo_old_stores));

/* A closed conversation names who closed it with no cascade. */
update public.flare_threads set closed_by = null
 where closed_by in (select id from demo_old_players);

/* Room identities. Their player_id is ON DELETE SET NULL, so deleting
   the players would orphan them; deleting them takes their seats,
   board Flares, Have lists and offers with them. */
delete from public.player_sessions where id in (select id from demo_old_sessions);

/* The store, and with it its nights, store posts, games and the rest. */
delete from public.events where id in (select id from demo_old_events);
delete from public.stores where id in (select id from demo_old_stores);

/* The players. Everything else they own cascades: binders, wants,
   follows, conversations, cosmetics, showcase, logged trades, posts. */
delete from public.players where id in (select id from demo_old_players);

-- ----------------------------------------------------------------------
-- 2. The people
-- ----------------------------------------------------------------------

/* Stable ids, the same on every run, so a deep link or a Maestro flow
   written against one run still works after the next. An account the
   script did not create is skipped by the join. */
create temp table demo_people on commit drop as
select d.*,
       u.id as user_id,
       md5('cardflare-demo:player:' || d.email)::uuid as player_id,
       md5('cardflare-demo:session:' || d.email)::uuid as session_id
  from demo_cast d
  join auth.users u on lower(u.email) = d.email;

/* What sign-up writes (createPlayerWithFreeName): the account, its name,
   its handle, and onboarded_at, because choosing a handle IS the setup
   step and needsSetup reads that column. The rest is the profile. */
insert into public.players (
  id, created_at, user_id, display_name, handle, onboarded_at, tier,
  embers_earned, embers_balance, bio, pronouns, postal_code,
  local_radius_miles, cosmetics_unlocked_draft
)
select p.player_id,
       now() - make_interval(days => p.joined_days_ago),
       p.user_id,
       p.display_name,
       p.handle,
       now() - make_interval(days => p.joined_days_ago) + interval '4 minutes',
       p.tier,
       p.embers_earned,
       p.embers_balance,
       p.bio,
       p.pronouns,
       p.postal_code,
       25,
       /* The hero's cosmetics are from the new catalogue, which a fresh
          database holds as drafts. ownsCosmetic gives a draft to exactly
          one grant, this one, so the hero owns what they wear the way
          the founder's own account does. */
       p.slot = 0
  from demo_people p;

/* One room identity per account, as accountRoomIdentity keeps it: the
   seat in every room, and the Have list's home. The token is random and
   nobody holds it; a signed-in app finds the seat by account
   (sessionInEventForPlayer). */
insert into public.player_sessions (
  id, created_at, last_seen_at, expires_at, display_name, token_hash, player_id
)
select p.session_id,
       now() - interval '20 days',
       now() - interval '1 minute',
       now() + interval '30 days',
       case when char_length(btrim(left(p.display_name, 24))) >= 2
            then btrim(left(p.display_name, 24))
            else 'Player' end,
       encode(sha256(convert_to(gen_random_uuid()::text || p.email, 'UTF8')), 'hex'),
       p.player_id
  from demo_people p;

/* Everybody plays One Piece. */
insert into public.player_games (player_id, game, created_at)
select p.player_id, 'one-piece', now() - make_interval(days => p.joined_days_ago)
  from demo_people p;

-- ----------------------------------------------------------------------
-- 3. The store and its nights
-- ----------------------------------------------------------------------

/* Grand Line Games, a fictional shop on South First in Austin. The
   phone is a 555 number and there is no website, so nothing on its page
   links anywhere that does not exist. Hours run Sunday first. */
insert into public.stores (
  id, created_at, name, city, region, status, is_pilot, join_code,
  walk_in_enabled, timezone, kind, early_board_hours, address_line,
  postal_code, country, latitude, longitude, phone, website,
  claim_status, tier, listing_state, verified_at, description, hours,
  onboarding_completed_at
)
values (
  md5('cardflare-demo:store:grand-line-games')::uuid,
  now() - interval '210 days',
  'Grand Line Games',
  'Austin',
  'TX',
  'active',
  true,
  'GRNDTX7',
  true,
  'America/Chicago',
  'lgs',
  48,
  '2214 S 1st St',
  '78704',
  'US',
  30.2433,
  -97.7556,
  '(512) 555-0142',
  null,
  'claimed',
  'free',
  'published',
  now() - interval '120 days',
  'Austin''s One Piece home. Locals most weeknights, a trade table that never empties, and a case worth a look.',
  '[{"open":"12:00","close":"20:00"},
    {"open":"14:00","close":"22:00"},
    {"open":"14:00","close":"22:00"},
    {"open":"14:00","close":"23:00"},
    {"open":"14:00","close":"23:00"},
    {"open":"12:00","close":"23:30"},
    {"open":"10:00","close":"23:30"}]'::jsonb,
  now() - interval '200 days'
);

insert into public.store_games (store_id, game)
values (md5('cardflare-demo:store:grand-line-games')::uuid, 'one-piece');

/* Tonight's night is open (the store pressed Open) and inside its
   window: started an hour ago, ends in three. That is "live" to
   roomPhase and the room a scan of SHANKS opens. The next four are
   posted but not open yet (draft), on the coming days at wall-clock
   times in Austin. Tomorrow's falls inside the 48-hour early board, so
   it already takes Flares. */
create temp table demo_nights (
  key text primary key,
  name text not null,
  code text not null,
  status public.event_status not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null
) on commit drop;

insert into demo_nights
select 'live', 'One Piece Locals', 'SHANKS', 'open'::public.event_status,
       now() - interval '1 hour', now() + interval '3 hours'
union all
select v.key, v.name, v.code, 'draft'::public.event_status,
       ((date_trunc('day', now() at time zone 'America/Chicago')
          + make_interval(days => v.days) + v.starts) at time zone 'America/Chicago'),
       ((date_trunc('day', now() at time zone 'America/Chicago')
          + make_interval(days => v.days) + v.starts + v.runs) at time zone 'America/Chicago')
  from (values
    ('prep',   'Store Championship Prep', 'GEAR5X', 1, time '18:30', interval '4 hours'),
    ('draft',  'OP09 Sealed Draft',       'ACE3TX', 3, time '19:00', interval '4 hours'),
    ('locals', 'One Piece Locals',        'YAMATX', 5, time '18:00', interval '4 hours'),
    ('meet',   'Trade Meet',              'SABTX5', 6, time '13:00', interval '4 hours')
  ) as v(key, name, code, days, starts, runs);

insert into public.events (
  id, created_at, store_id, name, game, starts_at, ends_at, status,
  join_code, kind, repeat_weekly
)
select md5('cardflare-demo:event:' || n.key)::uuid,
       now() - interval '6 days',
       md5('cardflare-demo:store:grand-line-games')::uuid,
       n.name,
       'one-piece',
       n.starts_at,
       n.ends_at,
       n.status,
       n.code,
       'scheduled',
       false
  from demo_nights n;

/* Everybody follows the store: joining a room saves it as a local, and
   it is what puts the store's nights and posts in front of them. */
insert into public.player_locals (player_id, store_id, created_at)
select p.player_id,
       md5('cardflare-demo:store:grand-line-games')::uuid,
       now() - make_interval(days => least(p.joined_days_ago, 180))
  from demo_people p;

-- ----------------------------------------------------------------------
-- 4. Have lists and binders
-- ----------------------------------------------------------------------

/* What each person holds for trade, in pocket order. For the hero this
   is the Trade binder, two full pages and a few on the third. For the
   cast it is a short Have list, which is what the room and its matches
   read. OP04-118 sits on the hero's first page because it is the card
   Jordan traded them tonight. */
create temp table demo_haves (
  slot int not null,
  num text not null,
  qty int not null,
  pocket int not null,
  primary key (slot, num)
) on commit drop;

insert into demo_haves (slot, num, qty, pocket) values
  (0, 'OP01-120', 1, 0),  (0, 'OP05-119', 1, 1),  (0, 'OP01-121', 1, 2),
  (0, 'OP02-013', 2, 3),  (0, 'OP06-118', 1, 4),  (0, 'OP01-025', 3, 5),
  (0, 'OP04-118', 1, 6),  (0, 'OP01-016', 4, 7),  (0, 'OP01-047', 2, 8),
  (0, 'OP01-078', 1, 9),  (0, 'OP02-004', 2, 10), (0, 'OP03-112', 2, 11),
  (0, 'OP05-069', 1, 12), (0, 'OP06-119', 1, 13), (0, 'OP01-051', 2, 14),
  (0, 'OP09-004', 1, 15), (0, 'ST01-012', 3, 16), (0, 'ST01-013', 2, 17),
  (0, 'OP03-099', 1, 18), (0, 'OP01-060', 1, 19), (0, 'OP01-061', 1, 20),
  (0, 'OP08-118', 1, 21),
  (1, 'OP09-118', 1, 0),  (1, 'OP03-099', 1, 1),  (1, 'OP02-001', 1, 2),  (1, 'OP01-016', 2, 3),
  (2, 'OP09-119', 1, 0),  (2, 'OP09-004', 2, 1),  (2, 'OP01-003', 1, 2),  (2, 'ST01-012', 2, 3),
  (3, 'OP07-051', 1, 0),  (3, 'OP01-078', 2, 1),  (3, 'OP03-122', 1, 2),  (3, 'OP01-051', 1, 3),
  (4, 'OP02-001', 1, 0),  (4, 'OP01-061', 1, 1),  (4, 'ST15-002', 2, 2),
  (5, 'OP01-003', 1, 0),  (5, 'ST01-013', 2, 1),
  (6, 'EB01-001', 1, 0),  (6, 'OP09-001', 2, 1),  (6, 'ST01-001', 1, 2),
  (7, 'OP05-001', 1, 0),  (7, 'OP04-001', 1, 1),
  (8, 'ST01-013', 3, 0),  (8, 'OP01-025', 1, 1),
  (9, 'OP01-047', 1, 0),  (9, 'OP01-060', 1, 1),
  (10, 'ST13-003', 1, 0), (10, 'ST01-012', 2, 1), (10, 'ST01-001', 2, 2),
  (11, 'OP01-016', 1, 0),
  (12, 'OP06-119', 1, 0), (12, 'OP03-077', 1, 1), (12, 'OP07-051', 1, 2), (12, 'OP09-001', 1, 3);

/* Each person's Trade binder: for_trade, public, first in their row.
   share_code is the short link, made the way the pockets migration
   made them. The hero's wears the galaxy cover. */
insert into public.binders (
  id, player_id, name, cover, layout, is_public, for_trade, position,
  created_at, updated_at, share_code
)
select md5('cardflare-demo:binder:' || p.email || ':trade')::uuid,
       p.player_id,
       'Trade binder',
       case p.slot when 0 then 'galaxy' when 1 then 'ember' when 6 then 'frost'
                   when 9 then 'rose' else 'charcoal' end,
       3, true, true, 0,
       now() - make_interval(days => p.joined_days_ago) + interval '1 day',
       now() - interval '2 hours',
       substr(md5('cardflare-demo:share:' || p.email || ':trade'), 1, 8)
  from demo_people p
 where exists (select 1 from demo_haves h where h.slot = p.slot);

/* The cards, in pockets. Numbered from the resolved cards only, so a
   number the catalogue lacks closes up rather than leaving a hole. */
insert into public.binder_cards (binder_id, card_id, printing_id, quantity, position, created_at)
select md5('cardflare-demo:binder:' || p.email || ':trade')::uuid,
       c.card_id,
       null,
       h.qty,
       (row_number() over (partition by h.slot order by h.pocket) - 1)::int,
       now() - make_interval(days => 30 - least(h.pocket, 29))
  from demo_haves h
  join demo_people p on p.slot = h.slot
  join demo_cards c on c.num = h.num;

/* The cover window: the hero's Shanks secret, or whatever is in the
   first pocket if the catalogue lacks it. */
update public.binders b
   set front_card_id = (
     select bc.id from public.binder_cards bc
      where bc.binder_id = b.id
      order by bc.position
      limit 1)
 where b.player_id in (select player_id from demo_people);

/* The Have list, derived from the binders up for trade the way
   syncTradeCard keeps it: one row per card on the account's session,
   marked local_trade, carrying the binder's count. */
insert into public.player_cards (
  created_at, updated_at, player_session_id, card_id, printing_id,
  quantity, confirmed_at, local_trade
)
select now() - make_interval(days => 30 - least(h.pocket, 29)),
       now() - interval '2 hours',
       p.session_id,
       c.card_id,
       null,
       h.qty,
       now() - interval '2 hours',
       true
  from demo_haves h
  join demo_people p on p.slot = h.slot
  join demo_cards c on c.num = h.num;

/* Two private binders beside the hero's Trade binder, so the profile's
   row of binders has three covers in it. Private binders take no part
   in matching; that is the Trade binder's job. */
insert into public.binders (
  id, player_id, name, cover, layout, is_public, for_trade, position,
  created_at, updated_at, share_code
)
select md5('cardflare-demo:binder:' || p.email || ':' || v.key)::uuid,
       p.player_id, v.name, v.cover, 3, false, false, v.pos,
       now() - interval '60 days', now() - interval '3 days',
       substr(md5('cardflare-demo:share:' || p.email || ':' || v.key), 1, 8)
  from demo_people p
  cross join (values
    ('deck', 'Red Shanks deck', 'ember', 1),
    ('alts', 'Alt arts',        'gold',  2)
  ) as v(key, name, cover, pos)
 where p.slot = 0;

insert into public.binder_cards (binder_id, card_id, printing_id, quantity, position, created_at)
select md5('cardflare-demo:binder:' || p.email || ':' || v.key)::uuid,
       c.card_id, null, v.qty,
       (row_number() over (partition by v.key order by v.pocket) - 1)::int,
       now() - interval '40 days'
  from demo_people p
  cross join (values
    ('deck', 'OP09-004', 2, 0), ('deck', 'OP01-120', 1, 1), ('deck', 'ST01-012', 4, 2),
    ('deck', 'OP01-016', 4, 3), ('deck', 'OP02-004', 2, 4), ('deck', 'OP06-119', 1, 5),
    ('alts', 'OP05-119', 1, 0), ('alts', 'OP01-121', 1, 1), ('alts', 'OP04-118', 1, 2),
    ('alts', 'OP06-118', 1, 3)
  ) as v(key, num, qty, pocket)
  join demo_cards c on c.num = v.num
 where p.slot = 0;

-- ----------------------------------------------------------------------
-- 5. Wants and Flares
-- ----------------------------------------------------------------------

/* Flares on tonight's board, cast first. batch groups the cards one
   person posted together (posted_batch), mins is how long ago. The
   want rows on cards the hero holds are the green rings; the showcase
   rows ("letting go") on cards the hero wants are the other half of a
   match. */
create temp table demo_board (
  slot int not null,
  num text not null,
  intent text not null,
  qty int not null,
  batch text not null,
  mins int not null
) on commit drop;

insert into demo_board (slot, num, intent, qty, batch, mins) values
  (1, 'OP01-120', 'want', 1, 'w', 48), (1, 'OP03-112', 'want', 1, 'w', 48),
  (1, 'OP09-118', 'showcase', 1, 's', 47),
  (2, 'OP05-119', 'want', 1, 'w', 44), (2, 'OP05-060', 'want', 1, 'w', 44),
  (2, 'OP09-119', 'showcase', 1, 's', 43),
  (3, 'OP09-118', 'want', 1, 'w', 41), (3, 'OP07-051', 'showcase', 1, 's', 41),
  (4, 'OP01-121', 'want', 1, 'w', 39), (4, 'OP02-004', 'want', 2, 'w', 39),
  (4, 'OP02-001', 'showcase', 1, 's', 38),
  (5, 'OP06-119', 'want', 1, 'w', 35), (5, 'OP05-060', 'want', 1, 'w', 35),
  (5, 'OP01-003', 'showcase', 1, 's', 34),
  (6, 'OP02-013', 'want', 1, 'w', 31), (6, 'OP09-004', 'want', 2, 'w', 31),
  (6, 'EB01-001', 'showcase', 1, 's', 30),
  (7, 'OP02-013', 'want', 2, 'w', 27), (7, 'OP03-001', 'want', 1, 'w', 27),
  (7, 'OP05-001', 'showcase', 1, 's', 26),
  (8, 'OP06-118', 'want', 1, 'w', 23), (8, 'OP01-001', 'want', 1, 'w', 23),
  (8, 'ST01-013', 'showcase', 2, 's', 22),
  (9, 'OP01-016', 'want', 2, 'w', 19), (9, 'OP03-040', 'want', 1, 'w', 19),
  (9, 'OP01-047', 'showcase', 1, 's', 18),
  (10, 'ST15-002', 'want', 1, 'w', 44),
  (10, 'ST13-003', 'showcase', 1, 's', 44), (10, 'ST01-012', 'showcase', 1, 's', 44),
  (11, 'OP04-001', 'want', 1, 'w', 33), (11, 'OP04-118', 'want', 1, 'w', 33),
  (11, 'OP01-025', 'want', 1, 'w', 33);

/* The hero's saved wants: the Flare list that follows them between
   rooms and that a join posts to the board (postFlaresOnJoin). Two of
   them carry the deck they are for. */
create temp table demo_hero_wants (
  num text primary key,
  qty int not null,
  deck_label text
) on commit drop;

insert into demo_hero_wants (num, qty, deck_label) values
  ('OP09-118', 1, null),
  ('OP09-119', 1, null),
  ('OP07-051', 1, null),
  ('EB01-001', 1, null),
  ('OP05-001', 1, null),
  ('ST13-003', 1, null),
  ('OP09-001', 1, 'Red Shanks');

/* The hero walked in 52 minutes ago and auto-post put their wants up
   as one batch and their one offering as another, exactly as a join
   does. */
insert into demo_board (slot, num, intent, qty, batch, mins)
select 0, w.num, 'want', w.qty, 'w', 51 from demo_hero_wants w
union all
select 0, 'OP01-025', 'showcase', 3, 's', 51;

/* Posts to the Feed, away from any room: Area Flares. Each is one
   flare_posts row and a Flare per card, keyed by the same batch id,
   which is what publishFlare writes. The caption rides the first card
   as its note, as publish does. Captions are short and about the cards;
   terms are trade, or trade or cash, never an amount. */
create temp table demo_area_posts (
  slot int not null,
  key text not null,
  intent text not null,
  mins int not null,
  caption text,
  accepts_cash boolean not null,
  primary key (slot, key)
) on commit drop;

insert into demo_area_posts (slot, key, intent, mins, caption, accepts_cash) values
  (5,  'a', 'want',     7,    'Finishing purple Luffy before the next locals. Anyone bringing these?', false),
  (2,  'a', 'showcase', 26,   'Pulled doubles from my OP09 box. Trade only, at Grand Line most nights.', false),
  (7,  'a', 'want',     72,   'Two Aces and the leader and my Sabo list is done.', false),
  (3,  'a', 'showcase', 160,  'Letting my Hancocks go. Trade or cash, happy to meet at the store.', true),
  (9,  'a', 'want',     295,  'Nami for the Nami deck, obviously.', false),
  (10, 'a', 'showcase', 500,  'Clearing out my starter deck pile.', false),
  (8,  'a', 'want',     1260, 'The last Zoro I am missing.', false);

create temp table demo_area_cards (
  slot int not null,
  key text not null,
  num text not null,
  qty int not null,
  ord int not null,
  primary key (slot, key, num)
) on commit drop;

insert into demo_area_cards (slot, key, num, qty, ord) values
  (5, 'a', 'OP05-119', 1, 0), (5, 'a', 'OP05-060', 1, 1),
  (2, 'a', 'OP09-119', 1, 0), (2, 'a', 'OP09-004', 1, 1),
  (7, 'a', 'OP02-013', 2, 0), (7, 'a', 'OP03-001', 1, 1),
  (3, 'a', 'OP07-051', 1, 0), (3, 'a', 'OP01-078', 1, 1),
  (9, 'a', 'OP01-016', 1, 0), (9, 'a', 'OP03-040', 1, 1),
  (10, 'a', 'ST13-003', 1, 0), (10, 'a', 'ST01-012', 1, 1), (10, 'a', 'ST01-001', 1, 2),
  (8, 'a', 'OP06-118', 1, 0);

/* Saved wants, everybody's. A want Flare, on a board or in the Feed, is
   also a saved want (publishFlare calls saveWant), so the cast's come
   from their want Flares and the hero's from the list above. These are
   what the profile's Flares grid and the night's matches read. */
insert into public.player_wants (created_at, player_id, card_id, printing_id, quantity, deck_label)
select now() - interval '9 days', p.player_id, c.card_id, null, w.qty, w.deck_label
  from demo_hero_wants w
  join demo_people p on p.slot = 0
  join demo_cards c on c.num = w.num;

insert into public.player_wants (created_at, player_id, card_id, printing_id, quantity)
select now() - make_interval(mins => max(x.mins)), p.player_id, c.card_id, null, max(x.qty)
  from (
    select b.slot, b.num, b.qty, b.mins from demo_board b
     where b.intent = 'want' and b.slot <> 0
    union all
    select ac.slot, ac.num, ac.qty, ap.mins
      from demo_area_cards ac
      join demo_area_posts ap on ap.slot = ac.slot and ap.key = ac.key
     where ap.intent = 'want' and ac.slot <> 0
  ) x
  join demo_people p on p.slot = x.slot
  join demo_cards c on c.num = x.num
 group by p.player_id, c.card_id;

/* The board's posts. Every batch gets its flare_posts row, the room's
   included, so the post screen and the Feed find one for any batch. A
   batch none of whose cards resolved gets no post: an empty one would
   be a post with nothing in it. */
insert into public.flare_posts (
  id, created_at, published_at, player_id, player_session_id, intent, event_id
)
select distinct on (b.slot, b.batch)
       md5('cardflare-demo:batch:' || p.email || ':board:' || b.batch)::uuid,
       now() - make_interval(mins => b.mins),
       now() - make_interval(mins => b.mins),
       p.player_id,
       p.session_id,
       b.intent,
       md5('cardflare-demo:event:live')::uuid
  from demo_board b
  join demo_people p on p.slot = b.slot
  join demo_cards c on c.num = b.num
 order by b.slot, b.batch, b.mins desc;

insert into public.flares (
  created_at, updated_at, event_id, player_session_id, status, card_id,
  printing_id, quantity, intent, accepts_trade, accepts_cash, posted_batch,
  deck_label
)
select now() - make_interval(mins => b.mins),
       now() - make_interval(mins => b.mins),
       md5('cardflare-demo:event:live')::uuid,
       p.session_id,
       'open',
       c.card_id,
       null,
       b.qty,
       b.intent,
       true,
       false,
       md5('cardflare-demo:batch:' || p.email || ':board:' || b.batch)::uuid,
       case when b.slot = 0 then (select w.deck_label from demo_hero_wants w where w.num = b.num) end
  from demo_board b
  join demo_people p on p.slot = b.slot
  join demo_cards c on c.num = b.num;

/* The Feed's posts. */
insert into public.flare_posts (
  id, created_at, published_at, player_id, player_session_id, intent, caption
)
select md5('cardflare-demo:batch:' || p.email || ':area:' || a.key)::uuid,
       now() - make_interval(mins => a.mins),
       now() - make_interval(mins => a.mins),
       p.player_id,
       p.session_id,
       a.intent,
       a.caption
  from demo_area_posts a
  join demo_people p on p.slot = a.slot
 where exists (
   select 1 from demo_area_cards ac
     join demo_cards c on c.num = ac.num
    where ac.slot = a.slot and ac.key = a.key);

insert into public.flares (
  created_at, updated_at, event_id, player_session_id, player_id,
  posted_postal_code, status, card_id, printing_id, quantity, intent,
  accepts_trade, accepts_cash, posted_batch, note
)
select now() - make_interval(mins => a.mins),
       now() - make_interval(mins => a.mins),
       null,
       null,
       p.player_id,
       p.postal_code,
       'open',
       c.card_id,
       null,
       ac.qty,
       a.intent,
       true,
       a.accepts_cash,
       md5('cardflare-demo:batch:' || p.email || ':area:' || a.key)::uuid,
       case when ac.ord = 0 then a.caption end
  from demo_area_cards ac
  join demo_area_posts a on a.slot = ac.slot and a.key = ac.key
  join demo_people p on p.slot = ac.slot
  join demo_cards c on c.num = ac.num;

/* Hands raised on two of the hero's wants: Maya has the Roger and Dev
   the Luffy, each saying where to find them (flare_responses, the
   room's offer). */
insert into public.flare_responses (flare_id, responder_session_id, message, created_at, quantity)
select f.id, r.session_id, v.message, now() - make_interval(mins => v.mins), 1
  from (values
    (1, 'OP09-118', 'Back table by the window', 12),
    (2, 'OP09-119', 'Grabbing a drink, then the trade table', 5)
  ) as v(slot, num, message, mins)
  join demo_people r on r.slot = v.slot
  join demo_people h on h.slot = 0
  join demo_cards c on c.num = v.num
  join public.flares f
    on f.player_session_id = h.session_id
   and f.event_id = md5('cardflare-demo:event:live')::uuid
   and f.card_id = c.card_id
   and f.intent = 'want';

-- ----------------------------------------------------------------------
-- 6. Who is in the room, and who is going later
-- ----------------------------------------------------------------------

/* Tonight: the hero and eleven of the cast. Seen within the last few
   minutes, so they count as here now, except two who wandered off
   from the board a while ago. Three say they are open to trades. */
insert into public.event_participants (
  event_id, player_session_id, joined_at, last_seen_at, open_to_trades
)
select md5('cardflare-demo:event:live')::uuid,
       p.session_id,
       now() - make_interval(mins => v.joined),
       now() - make_interval(mins => v.seen),
       v.open_to_trades
  from (values
    (0, 52, 1, false),
    (1, 49, 2, true),
    (2, 45, 3, false),
    (3, 42, 1, false),
    (4, 40, 6, true),
    (5, 36, 4, false),
    (6, 32, 2, false),
    (7, 28, 5, false),
    (8, 24, 9, true),
    (9, 20, 3, false),
    (10, 46, 38, false),
    (11, 35, 31, false)
  ) as v(slot, joined, seen, open_to_trades)
  join demo_people p on p.slot = v.slot;

/* Going to the nights ahead: saying Going is a seat on that night's
   room (setGoing joins it), so the store page and the Rooms tab have
   counts, and the hero is down for two of them. */
insert into public.event_participants (event_id, player_session_id, joined_at, last_seen_at)
select md5('cardflare-demo:event:' || v.night)::uuid,
       p.session_id,
       now() - make_interval(hours => v.hours),
       now() - make_interval(hours => v.hours)
  from (values
    ('prep', 0, 20), ('prep', 3, 30), ('prep', 6, 26), ('prep', 7, 5), ('prep', 12, 2),
    ('prep', 1, 44), ('prep', 9, 11),
    ('draft', 0, 18), ('draft', 2, 40), ('draft', 5, 8), ('draft', 11, 3),
    ('locals', 1, 22), ('locals', 9, 7), ('locals', 4, 50),
    ('meet', 10, 6), ('meet', 12, 9)
  ) as v(night, slot, hours)
  join demo_people p on p.slot = v.slot;

-- ----------------------------------------------------------------------
-- 7. Following, hearts and comments
-- ----------------------------------------------------------------------

/* The hero follows ten of the cast and all twelve follow back, so the
   profile reads 12 followers and 10 following. Nia and Owen are not
   followed back, and Owen's binder holds two of the hero's wants, so
   the Feed has a "their binders answer your wants" suggestion to make.
   A few of the cast follow each other too. */
insert into public.player_follows (follower_id, followed_id, created_at)
select a.player_id, b.player_id, now() - make_interval(days => v.days)
  from (values
    (0, 1, 120), (0, 2, 98), (0, 3, 140), (0, 4, 80), (0, 5, 60),
    (0, 6, 133), (0, 7, 41), (0, 8, 77), (0, 9, 102), (0, 10, 22),
    (1, 0, 118), (2, 0, 95), (3, 0, 139), (4, 0, 79), (5, 0, 58),
    (6, 0, 130), (7, 0, 40), (8, 0, 70), (9, 0, 100), (10, 0, 21),
    (11, 0, 12), (12, 0, 88),
    (1, 6, 90), (6, 1, 90), (3, 8, 60), (5, 2, 50), (2, 5, 49),
    (7, 3, 30), (9, 1, 70), (11, 7, 10)
  ) as v(follower, followed, days)
  join demo_people a on a.slot = v.follower
  join demo_people b on b.slot = v.followed;

/* Hearts on the Feed's posts, the hero's own among them on Dev's. */
insert into public.flare_post_likes (post_id, player_id, created_at)
select md5('cardflare-demo:batch:' || author.email || ':area:a')::uuid,
       liker.player_id,
       now() - make_interval(mins => v.mins)
  from (values
    (5, 9, 5), (5, 2, 4), (5, 7, 2), (5, 0, 1),
    (2, 0, 20), (2, 5, 18), (2, 6, 15), (2, 1, 11), (2, 11, 9),
    (7, 6, 60), (7, 4, 41),
    (3, 1, 150), (3, 11, 120), (3, 5, 90),
    (9, 5, 280),
    (8, 1, 1200), (8, 2, 900)
  ) as v(author, liker, mins)
  join demo_people author on author.slot = v.author
  join demo_people liker on liker.slot = v.liker;

/* A few short threads under them. */
insert into public.flare_post_comments (post_id, player_id, kind, body, created_at)
select md5('cardflare-demo:batch:' || author.email || ':area:a')::uuid,
       writer.player_id,
       'comment',
       v.body,
       now() - make_interval(mins => v.mins)
  from (values
    (5, 9, 'Saw the Luffy on the board at Grand Line tonight.', 5),
    (5, 5, 'Heading there now!', 3),
    (2, 0, 'Is the Luffy still around? I can swap from my trade binder.', 19),
    (2, 2, 'Still here, back table by the window.', 16),
    (3, 1, 'That alt art is gorgeous.', 140)
  ) as v(author, writer, body, mins)
  join demo_people author on author.slot = v.author
  join demo_people writer on writer.slot = v.writer;

/* The store's posts to its followers: one about the case, one pointing
   at tomorrow's prep night (store_posts; hearts and comments hang off
   the same tables a player's post uses). */
insert into public.store_posts (id, created_at, published_at, store_id, title, body, event_id)
values
  (md5('cardflare-demo:store-post:case')::uuid,
   now() - interval '3 hours', now() - interval '3 hours',
   md5('cardflare-demo:store:grand-line-games')::uuid,
   'Fresh OP09 singles in the case',
   'Restocked this morning: leaders, alt arts and a couple of secrets. Ask at the counter, and bring your binder to the trade table.',
   null),
  (md5('cardflare-demo:store-post:prep')::uuid,
   now() - interval '1 day', now() - interval '1 day',
   md5('cardflare-demo:store:grand-line-games')::uuid,
   'Store Championship prep night',
   'Practice rounds, deck chats and a full trade table. Say Going so we know how many tables to put out.',
   md5('cardflare-demo:event:prep')::uuid);

insert into public.flare_post_likes (post_id, player_id, created_at)
select md5('cardflare-demo:store-post:' || v.post)::uuid, p.player_id, now() - make_interval(mins => v.mins)
  from (values
    ('case', 1, 170), ('case', 3, 150), ('case', 6, 120), ('case', 9, 40),
    ('prep', 0, 1300), ('prep', 6, 1200), ('prep', 7, 900)
  ) as v(post, slot, mins)
  join demo_people p on p.slot = v.slot;

insert into public.flare_post_comments (post_id, player_id, kind, body, created_at)
select md5('cardflare-demo:store-post:case')::uuid, p.player_id, 'comment',
       'Any Shanks leaders left?', now() - interval '2 hours'
  from demo_people p
 where p.slot = 6;

-- ----------------------------------------------------------------------
-- 8. Messages and the trade
-- ----------------------------------------------------------------------

/* Three direct conversations (no Flare, no want: the pair's one chat,
   which is all the Messages list reads). The person written to sits in
   the author's chair, as openDirectThread does. */
create temp table demo_threads (
  key text primary key,
  author int not null,
  responder int not null
) on commit drop;

insert into demo_threads (key, author, responder) values
  ('jordan', 0, 3),
  ('sofia',  0, 7),
  ('caleb',  0, 10);

create temp table demo_messages (
  key text not null,
  seq int not null,
  sender int not null,
  mins int not null,
  body text not null,
  num text,
  read boolean not null,
  primary key (key, seq)
) on commit drop;

insert into demo_messages (key, seq, sender, mins, body, num, read) values
  ('jordan', 1, 3, 34, 'Hey! Saw the Sogeking secret in your trade binder. Still up for trade?', 'OP03-122', true),
  ('jordan', 2, 0, 32, 'It is! Anything from my wants?', null, true),
  ('jordan', 3, 3, 30, 'I have the Vivi secret from OP04. Been in a toploader since release.', 'OP04-118', true),
  ('jordan', 4, 0, 28, 'That has been on my list forever. Straight swap?', null, true),
  ('jordan', 5, 3, 25, 'Deal. I''m at Grand Line tonight, back table by the playmats.', null, true),
  ('jordan', 6, 0, 13, 'Walking over now', null, true),
  ('jordan', 7, 3, 6, 'Pleasure doing business. Good luck in round 3!', null, false),
  ('sofia', 1, 7, 130, 'Hey, do you still have a spare Ace?', 'OP02-013', true),
  ('sofia', 2, 0, 125, 'Yep, got two. Bringing my binder to the next locals.', null, true),
  ('sofia', 3, 7, 118, 'Perfect, see you there', null, true),
  ('caleb', 1, 10, 1450, 'Saw you are hunting the ST13 Luffy. I have one in my binder.', 'ST13-003', true),
  ('caleb', 2, 0, 1440, 'Nice! Are you around this week?', null, true),
  ('caleb', 3, 10, 1380, 'The trade meet at Grand Line for sure. I''ll bring it.', null, false);

insert into public.flare_threads (id, created_at, author_player_id, responder_player_id, last_message_at)
select md5('cardflare-demo:thread:' || t.key)::uuid,
       now() - make_interval(mins => (select max(m.mins) from demo_messages m where m.key = t.key)),
       a.player_id,
       r.player_id,
       now() - make_interval(mins => (select min(m.mins) from demo_messages m where m.key = t.key))
  from demo_threads t
  join demo_people a on a.slot = t.author
  join demo_people r on r.slot = t.responder;

/* A message that shows a card carries it in card_ids (and card_id, for
   older readers). A card the catalogue lacks leaves the words alone. */
insert into public.flare_messages (
  created_at, thread_id, sender_player_id, body, read_at, card_id, card_ids, printing_ids
)
select now() - make_interval(mins => m.mins),
       md5('cardflare-demo:thread:' || m.key)::uuid,
       s.player_id,
       m.body,
       case when m.read then now() - make_interval(mins => greatest(m.mins - 1, 0)) end,
       c.card_id,
       case when c.card_id is null then '{}'::uuid[] else array[c.card_id] end,
       '{}'::uuid[]
  from demo_messages m
  join demo_people s on s.slot = m.sender
  join public.flare_threads t on t.id = md5('cardflare-demo:thread:' || m.key)::uuid
  left join demo_cards c on c.num = m.num;

/* "We traded", said by the hero and confirmed by Jordan: a trades row
   on the conversation, acknowledged, which latestThreadTrade reads as
   "confirmed" and the app draws as "Traded Nefeltari Vivi. Both
   confirmed." The hero is the requester because the card came to them. */
insert into public.trades (
  thread_id, event_id, flare_id, requester_player_id, holder_player_id,
  proposed_by, card_id, printing_id, quantity, confirmed_at, acknowledged_at
)
select md5('cardflare-demo:thread:jordan')::uuid,
       null, null,
       h.player_id, j.player_id, h.player_id,
       c.card_id, null, 1,
       now() - interval '9 minutes',
       now() - interval '8 minutes'
  from demo_people h
  join demo_people j on j.slot = 3
  join demo_cards c on c.num = 'OP04-118'
  join public.flare_threads t on t.id = md5('cardflare-demo:thread:jordan')::uuid
 where h.slot = 0;

/* Two older trades the hero logged by hand, for the trade history
   behind the profile. */
insert into public.logged_trades (
  created_at, player_id, card_id, printing_id, quantity, direction,
  partner_player_id, partner_name, place, traded_on, note
)
select now() - make_interval(days => v.days),
       h.player_id, c.card_id, null, 1, v.direction,
       partner.player_id,
       case when partner.player_id is null then v.partner_name end,
       'Grand Line Games',
       (now() at time zone 'America/Chicago')::date - v.days,
       v.note
  from (values
    ('OP01-120', 'got',  null::int, 'Ryan', 24, 'Fresh out of his OP01 box.'),
    ('OP02-001', 'gave', 4,         null,   9,  null)
  ) as v(num, direction, partner_slot, partner_name, days, note)
  join demo_people h on h.slot = 0
  join demo_cards c on c.num = v.num
  left join demo_people partner on partner.slot = v.partner_slot;

-- ----------------------------------------------------------------------
-- 9. The hero's profile: Pro, dressed, showcased
-- ----------------------------------------------------------------------

/* Owned. The legacy frames and holos are live and cost Embers, so
   buying them is what owning them means. The new catalogue's rings,
   nameplates and the rest are drafts in a fresh database; the rows here
   record them anyway, so they stay owned if the founder sets them live
   and the draft grant is ever taken back. A slug the catalogue lacks
   is skipped by the join. */
insert into public.player_cosmetics (player_id, cosmetic_slug, acquired_at)
select p.player_id, k.slug, now() - make_interval(days => v.days)
  from (values
    ('galaxy-edge', 60), ('prism-edge', 75), ('ember-edge', 110),
    ('galaxy-holo', 60), ('prism-holo', 90), ('shimmer', 100),
    ('ring-galaxy', 20), ('name-holographic-name', 20), ('title-collector', 20),
    ('badge-early-adopter', 130), ('scene-shooting-stars', 20),
    ('border-aurora', 18), ('pattern-galaxy', 18), ('bg-galaxy', 18),
    ('anim-shimmer', 18)
  ) as v(slug, days)
  join public.cosmetics k on k.slug = v.slug
  join demo_people p on p.slot = 0;

/* Worn. One slug per kind (player_equips), read by dressedEquipsFor and
   avatarWearFor, which only honour them for a Pro. The ring replaces
   the old avatar frame, as setEquip does, so that column stays null. */
insert into public.player_equips (player_id, kind, cosmetic_slug, updated_at)
select p.player_id, k.kind, k.slug, now() - interval '18 days'
  from (values
    ('ring-galaxy'), ('name-holographic-name'), ('title-collector'),
    ('badge-early-adopter'), ('scene-shooting-stars'),
    ('border-aurora'), ('pattern-galaxy'), ('bg-galaxy'), ('anim-shimmer')
  ) as v(slug)
  join public.cosmetics k on k.slug = v.slug
  join demo_people p on p.slot = 0
 where k.kind in ('ring', 'aura', 'border', 'pattern', 'animation', 'background',
                  'scene', 'nameplate', 'title', 'badge');

/* The legacy slots: the card frame, the holo and the avatar effect. */
update public.players pl
   set equipped_frame  = (select slug from public.cosmetics where slug = 'galaxy-edge'),
       equipped_holo   = (select slug from public.cosmetics where slug = 'prism-holo'),
       equipped_effect = (select slug from public.cosmetics where slug = 'shimmer')
  from demo_people p
 where p.slot = 0 and pl.id = p.player_id;

/* The cast who are Pro wear a ring each, bought from a pack, so the
   room's faces are not all bare. */
insert into public.player_cosmetics (player_id, cosmetic_slug, acquired_at)
select p.player_id, k.slug, now() - interval '30 days'
  from demo_people p
  join public.cosmetics k on k.slug = p.ring
 where p.slot <> 0;

insert into public.player_equips (player_id, kind, cosmetic_slug, updated_at)
select p.player_id, 'ring', k.slug, now() - interval '30 days'
  from demo_people p
  join public.cosmetics k on k.slug = p.ring and k.kind = 'ring'
 where p.slot <> 0;

/* The showcase: six chase cards, dressed with frames and holos the hero
   owns, two with a line about where they came from. */
insert into public.player_showcase (
  created_at, player_id, card_id, printing_id, position, frame_slug, holo_slug, note
)
select now() - make_interval(days => 40 - v.pos),
       p.player_id,
       c.card_id,
       null,
       (row_number() over (order by v.pos) - 1)::int,
       (select slug from public.cosmetics where slug = v.frame),
       (select slug from public.cosmetics where slug = v.holo),
       v.note
  from (values
    (0, 'OP01-120', 'galaxy-edge', 'galaxy-holo', 'First secret I ever pulled.'),
    (1, 'OP05-119', 'prism-edge',  'prism-holo',  null),
    (2, 'OP04-118', 'galaxy-edge', 'prism-holo',  'Traded for it at Grand Line.'),
    (3, 'OP01-121', 'prism-edge',  'galaxy-holo', null),
    (4, 'OP06-118', 'ember-edge',  'prism-holo',  null),
    (5, 'OP02-013', 'galaxy-edge', 'galaxy-holo', null)
  ) as v(pos, num, frame, holo, note)
  join demo_cards c on c.num = v.num
  join demo_people p on p.slot = 0;

-- ----------------------------------------------------------------------
-- 10. Report
-- ----------------------------------------------------------------------

do $$
declare
  r record;
  missing text;
begin
  select string_agg(l.num, ', ' order by l.num) into missing
    from demo_card_list l
   where not exists (select 1 from demo_cards c where c.num = l.num);

  raise notice 'demo seed: % of % card numbers resolved%',
    (select count(*) from demo_cards),
    (select count(*) from demo_card_list),
    coalesce('; skipped: ' || missing, '');

  raise notice 'demo seed: % of 13 demo accounts found in auth.users; hero is "%" (@%)',
    (select count(*) from demo_people),
    (select display_name from demo_people where slot = 0),
    (select handle from demo_people where slot = 0);

  for r in
    with people as (select player_id, session_id from demo_people),
         store as (select md5('cardflare-demo:store:grand-line-games')::uuid as id),
         nights as (select id from public.events where store_id = (select id from store)),
         posts as (
           select id from public.flare_posts where player_id in (select player_id from people)
           union all
           select id from public.store_posts where store_id = (select id from store))
    select * from (values
      (1,  'players',             (select count(*) from public.players where id in (select player_id from people))),
      (2,  'player_sessions',     (select count(*) from public.player_sessions where player_id in (select player_id from people))),
      (3,  'player_games',        (select count(*) from public.player_games where player_id in (select player_id from people))),
      (4,  'stores',              (select count(*) from public.stores where id = (select id from store))),
      (5,  'store_games',         (select count(*) from public.store_games where store_id = (select id from store))),
      (6,  'events',              (select count(*) from nights)),
      (7,  'player_locals',       (select count(*) from public.player_locals where store_id = (select id from store))),
      (8,  'event_participants',  (select count(*) from public.event_participants where event_id in (select id from nights))),
      (9,  'binders',             (select count(*) from public.binders where player_id in (select player_id from people))),
      (10, 'binder_cards',        (select count(*) from public.binder_cards where binder_id in (select id from public.binders where player_id in (select player_id from people)))),
      (11, 'player_cards',        (select count(*) from public.player_cards where player_session_id in (select session_id from people))),
      (12, 'player_wants',        (select count(*) from public.player_wants where player_id in (select player_id from people))),
      (13, 'flares (room)',       (select count(*) from public.flares where event_id in (select id from nights))),
      (14, 'flares (area)',       (select count(*) from public.flares where event_id is null and player_id in (select player_id from people))),
      (15, 'flare_posts',         (select count(*) from public.flare_posts where player_id in (select player_id from people))),
      (16, 'flare_responses',     (select count(*) from public.flare_responses where responder_session_id in (select session_id from people))),
      (17, 'store_posts',         (select count(*) from public.store_posts where store_id = (select id from store))),
      (18, 'flare_post_likes',    (select count(*) from public.flare_post_likes where post_id in (select id from posts))),
      (19, 'flare_post_comments', (select count(*) from public.flare_post_comments where post_id in (select id from posts))),
      (20, 'player_follows',      (select count(*) from public.player_follows where follower_id in (select player_id from people))),
      (21, 'flare_threads',       (select count(*) from public.flare_threads where author_player_id in (select player_id from people))),
      (22, 'flare_messages',      (select count(*) from public.flare_messages where sender_player_id in (select player_id from people))),
      (23, 'trades',              (select count(*) from public.trades where requester_player_id in (select player_id from people))),
      (24, 'logged_trades',       (select count(*) from public.logged_trades where player_id in (select player_id from people))),
      (25, 'player_cosmetics',    (select count(*) from public.player_cosmetics where player_id in (select player_id from people))),
      (26, 'player_equips',       (select count(*) from public.player_equips where player_id in (select player_id from people))),
      (27, 'player_showcase',     (select count(*) from public.player_showcase where player_id in (select player_id from people)))
    ) as t(ord, label, n)
    order by ord
  loop
    raise notice 'demo seed: % rows in %', r.n, r.label;
  end loop;
end $$;

commit;
