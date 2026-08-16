-- The duplicate-join mess, reproduced: one account, two sessions.
--
-- Seeded before 20260918090000 runs, so the migration has real rows to fold
-- rather than an empty table to succeed against. Run by
-- scripts/probe-migrations.sh.

begin;

insert into auth.users (id, email)
values ('11111111-1111-1111-1111-111111111111', 'founder@example.test');

insert into public.players (id, user_id, display_name)
values (
  '22222222-2222-2222-2222-222222222222',
  '11111111-1111-1111-1111-111111111111',
  'Zach'
);

-- The mobile site's session, older, and the app's, newer. Both the account's.
insert into public.player_sessions
  (id, display_name, token_hash, expires_at, created_at, player_id)
values
  ('33333333-3333-3333-3333-333333333333', 'Zach', repeat('a', 64),
   now() + interval '30 days', now() - interval '2 days',
   '22222222-2222-2222-2222-222222222222'),
  ('44444444-4444-4444-4444-444444444444', 'Zach', repeat('b', 64),
   now() + interval '30 days', now() - interval '1 day',
   '22222222-2222-2222-2222-222222222222');

-- A guest on the same night, who must come through untouched.
insert into public.player_sessions (id, display_name, token_hash, expires_at)
values ('55555555-5555-5555-5555-555555555555', 'Mika', repeat('c', 64),
        now() + interval '30 days');

insert into public.stores (id, name, contact_email, status, join_code)
values ('66666666-6666-6666-6666-666666666666', 'Test Cards',
        'shop@example.test', 'active', 'ABCD234');

insert into public.events (id, store_id, name, starts_at, ends_at, join_code, status)
values ('77777777-7777-7777-7777-777777777777',
        '66666666-6666-6666-6666-666666666666', 'Friday locals',
        now() - interval '1 hour', now() + interval '3 hours', 'K3M9PZ', 'open');

insert into public.cards
  (id, canonical_card_number, compact_card_number, exact_name, normalized_name,
   provider_key)
values
  ('88888888-8888-8888-8888-888888888888', 'OP01-016', 'OP01016', 'Nami',
   'nami', 'probe'),
  ('99999999-9999-9999-9999-999999999999', 'OP01-025', 'OP01025', 'Zoro',
   'zoro', 'probe');

-- Both devices in the room: the duplicate the founder saw on the board.
insert into public.event_participants
  (event_id, player_session_id, joined_at, last_seen_at, open_to_trades)
values
  ('77777777-7777-7777-7777-777777777777',
   '33333333-3333-3333-3333-333333333333',
   now() - interval '50 minutes', now() - interval '40 minutes', false),
  ('77777777-7777-7777-7777-777777777777',
   '44444444-4444-4444-4444-444444444444',
   now() - interval '10 minutes', now() - interval '2 minutes', true),
  ('77777777-7777-7777-7777-777777777777',
   '55555555-5555-5555-5555-555555555555',
   now() - interval '30 minutes', now() - interval '5 minutes', false);

-- Two binders. The same card on both, at different quantities, plus one card
-- only the app knows about.
insert into public.player_cards (player_session_id, card_id, printing_id, quantity, confirmed_at)
values
  ('33333333-3333-3333-3333-333333333333',
   '88888888-8888-8888-8888-888888888888', null, 1, now() - interval '2 days'),
  ('44444444-4444-4444-4444-444444444444',
   '88888888-8888-8888-8888-888888888888', null, 3, now() - interval '1 hour'),
  ('44444444-4444-4444-4444-444444444444',
   '99999999-9999-9999-9999-999999999999', null, 2, now() - interval '1 hour');

-- The same Flare from both devices, the website's already closed; and a
-- second Flare only the website posted.
insert into public.flares
  (id, event_id, player_session_id, card_id, printing_id, quantity, status)
values
  ('aaaaaaaa-0000-0000-0000-000000000001', '77777777-7777-7777-7777-777777777777',
   '33333333-3333-3333-3333-333333333333',
   '99999999-9999-9999-9999-999999999999', null, 1, 'cancelled'),
  ('aaaaaaaa-0000-0000-0000-000000000002', '77777777-7777-7777-7777-777777777777',
   '44444444-4444-4444-4444-444444444444',
   '99999999-9999-9999-9999-999999999999', null, 1, 'open'),
  ('aaaaaaaa-0000-0000-0000-000000000003', '77777777-7777-7777-7777-777777777777',
   '33333333-3333-3333-3333-333333333333',
   '88888888-8888-8888-8888-888888888888', null, 1, 'open');

-- The guest's Flare, and an offer on it from each of the account's devices.
insert into public.flares
  (id, event_id, player_session_id, card_id, printing_id, quantity, status)
values
  ('aaaaaaaa-0000-0000-0000-000000000004', '77777777-7777-7777-7777-777777777777',
   '55555555-5555-5555-5555-555555555555',
   '88888888-8888-8888-8888-888888888888', null, 1, 'open');

insert into public.flare_responses (flare_id, responder_session_id, message)
values
  ('aaaaaaaa-0000-0000-0000-000000000004',
   '33333333-3333-3333-3333-333333333333', 'By the door'),
  ('aaaaaaaa-0000-0000-0000-000000000004',
   '44444444-4444-4444-4444-444444444444', 'Table 4');

-- A trade recorded from the app's session, which must keep pointing at a real
-- person after the merge.
insert into public.trades
  (event_id, flare_id, requester_session_id, holder_session_id, card_id, quantity)
values
  ('77777777-7777-7777-7777-777777777777',
   'aaaaaaaa-0000-0000-0000-000000000004',
   '55555555-5555-5555-5555-555555555555',
   '44444444-4444-4444-4444-444444444444',
   '88888888-8888-8888-8888-888888888888', 1);

/*
 * The founder's real database had this and the probe did not: one half of
 * the split offering on the other half's Flare, and then a trade confirmed
 * against it. Perfectly legal today — they are two sessions, so nothing
 * refuses it — and impossible the moment they become one person, because
 * `trades_not_self` forbids the row and the application has always refused
 * a self-offer. Both have to survive the fold.
 */
insert into public.flare_responses (flare_id, responder_session_id, message)
values
  ('aaaaaaaa-0000-0000-0000-000000000003',
   '44444444-4444-4444-4444-444444444444', 'Other pocket');

insert into public.trades
  (event_id, flare_id, requester_session_id, holder_session_id, card_id, quantity)
values
  ('77777777-7777-7777-7777-777777777777',
   'aaaaaaaa-0000-0000-0000-000000000003',
   '33333333-3333-3333-3333-333333333333',
   '44444444-4444-4444-4444-444444444444',
   '88888888-8888-8888-8888-888888888888', 1);

commit;
