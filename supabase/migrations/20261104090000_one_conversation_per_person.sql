-- One conversation per person.
--
-- The founder, with Instagram's Messages open: "Conversation should be
-- person. Like this, showing their profile pic." A pair of people used
-- to have a separate thread for every Flare and every saved want one of
-- them answered, plus a direct one, so the same friend could fill the
-- list three times. Now the pair's direct thread is THE conversation:
-- every message lives there, and a message that opened an offer
-- carries the card it was about, drawn as a small card above the text.
--
-- The threads on a Flare or a want stay as anchors (so "already
-- talking about this card" keeps its answer), but this moves their
-- messages and trades into the pair's conversation, making one first
-- for any pair that only ever talked about a card.

begin;

alter table public.flare_messages
  add column if not exists card_id uuid references public.cards (id) on delete set null;

comment on column public.flare_messages.card_id is
  'The card this message offered or asked about, drawn above it. Null for ordinary talk.';

-- A conversation for every pair that only has anchors. The author's
-- chair goes to whoever was approached first, as on a Flare.
insert into public.flare_threads (author_player_id, responder_player_id, created_at, last_message_at)
select distinct on (least(author_player_id, responder_player_id), greatest(author_player_id, responder_player_id))
       author_player_id, responder_player_id, created_at, last_message_at
  from public.flare_threads
 where flare_id is not null or want_id is not null
 order by least(author_player_id, responder_player_id),
          greatest(author_player_id, responder_player_id),
          created_at asc
on conflict do nothing;

-- Each anchor's first message names the card it was about.
update public.flare_messages m
   set card_id = coalesce(f.card_id, w.card_id)
  from public.flare_threads t
  left join public.flares f on f.id = t.flare_id
  left join public.player_wants w on w.id = t.want_id
 where m.thread_id = t.id
   and (t.flare_id is not null or t.want_id is not null)
   and m.card_id is null
   and m.id = (
     select first.id
       from public.flare_messages first
      where first.thread_id = t.id
      order by first.created_at asc, first.id asc
      limit 1
   );

-- Every anchor's messages and trades move into the pair's conversation.
create temporary table conversation_moves on commit drop as
select anchor.id as anchor_id, pair.id as pair_id
  from public.flare_threads anchor
  join public.flare_threads pair
    on pair.flare_id is null
   and pair.want_id is null
   and least(pair.author_player_id, pair.responder_player_id)
       = least(anchor.author_player_id, anchor.responder_player_id)
   and greatest(pair.author_player_id, pair.responder_player_id)
       = greatest(anchor.author_player_id, anchor.responder_player_id)
 where anchor.flare_id is not null or anchor.want_id is not null;

update public.flare_messages m
   set thread_id = moves.pair_id
  from conversation_moves moves
 where m.thread_id = moves.anchor_id;

update public.trades tr
   set thread_id = moves.pair_id
  from conversation_moves moves
 where tr.thread_id = moves.anchor_id;

-- The conversation's clock is its newest message.
update public.flare_threads t
   set last_message_at = latest.at
  from (
    select thread_id, max(created_at) as at
      from public.flare_messages
     group by thread_id
  ) latest
 where t.id = latest.thread_id
   and t.flare_id is null
   and t.want_id is null
   and latest.at > t.last_message_at;

commit;
