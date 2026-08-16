-- What the migration had to be true afterwards. Every check raises rather
-- than printing, so the probe fails loudly instead of scrolling past.

do $$
declare
  n integer;
  q integer;
  s text;
begin
  -- One identity for the account, and it is the older one.
  select count(*) into n from public.player_sessions
   where player_id = '22222222-2222-2222-2222-222222222222';
  if n <> 1 then raise exception 'account kept % sessions, expected 1', n; end if;

  perform 1 from public.player_sessions
   where id = '33333333-3333-3333-3333-333333333333';
  if not found then raise exception 'the older session was not the survivor'; end if;

  -- The guest is untouched.
  perform 1 from public.player_sessions
   where id = '55555555-5555-5555-5555-555555555555' and player_id is null;
  if not found then raise exception 'the guest session was disturbed'; end if;

  -- The app's token still resolves, now to the surviving session.
  select player_session_id into s from public.player_session_tokens
   where token_hash = repeat('b', 64);
  if s is distinct from '33333333-3333-3333-3333-333333333333' then
    raise exception 'the second device was signed out (token resolves to %)', s;
  end if;

  -- One row on the board for the account, keeping the earlier arrival, the
  -- later sighting, and the fact that they said they were open to anything.
  select count(*) into n from public.event_participants
   where event_id = '77777777-7777-7777-7777-777777777777'
     and player_session_id = '33333333-3333-3333-3333-333333333333';
  if n <> 1 then raise exception 'board shows the account % times', n; end if;

  perform 1 from public.event_participants
   where player_session_id = '33333333-3333-3333-3333-333333333333'
     and open_to_trades
     and last_seen_at > joined_at;
  if not found then raise exception 'the merged membership lost its state'; end if;

  select count(*) into n from public.event_participants
   where event_id = '77777777-7777-7777-7777-777777777777';
  if n <> 2 then raise exception 'room has % participants, expected 2', n; end if;

  -- The binder is one binder, and the larger count won.
  select count(*) into n from public.player_cards
   where player_session_id = '33333333-3333-3333-3333-333333333333';
  if n <> 2 then raise exception 'binder has % rows, expected 2', n; end if;

  select quantity into q from public.player_cards
   where player_session_id = '33333333-3333-3333-3333-333333333333'
     and card_id = '88888888-8888-8888-8888-888888888888';
  if q <> 3 then raise exception 'binder quantity is %, expected 3', q; end if;

  -- The open Flare survived the closed duplicate.
  select count(*) into n from public.flares
   where player_session_id = '33333333-3333-3333-3333-333333333333'
     and card_id = '99999999-9999-9999-9999-999999999999';
  if n <> 1 then raise exception 'duplicate Flare left % rows', n; end if;

  perform 1 from public.flares
   where id = 'aaaaaaaa-0000-0000-0000-000000000002' and status = 'open'
     and player_session_id = '33333333-3333-3333-3333-333333333333';
  if not found then raise exception 'the open Flare lost to the closed one'; end if;

  -- One offer per Flare per person.
  select count(*) into n from public.flare_responses
   where flare_id = 'aaaaaaaa-0000-0000-0000-000000000004'
     and responder_session_id = '33333333-3333-3333-3333-333333333333';
  if n <> 1 then raise exception 'offers left % rows for one person', n; end if;

  -- History still points at somebody.
  perform 1 from public.trades
   where holder_session_id = '33333333-3333-3333-3333-333333333333';
  if not found then raise exception 'the trade lost its partner'; end if;

  -- And a second identity is now impossible.
  begin
    insert into public.player_sessions (display_name, token_hash, expires_at, player_id)
    values ('Zach', repeat('d', 64), now() + interval '30 days',
            '22222222-2222-2222-2222-222222222222');
    raise exception 'a second session for one account was accepted';
  exception when unique_violation then
    null;
  end;

  raise notice 'duplicate-join scenario: every check passed';
end
$$;
