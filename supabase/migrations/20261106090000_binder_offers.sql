-- Offers on a trade binder's cards, as a message that carries them.
--
-- The founder: "Any card in a trade binder you should be able to do the
-- same stack as making an offer on their trade cards... Can then DM them
-- about them." A binder card is no Flare, so the offer is a message in
-- the pair's one conversation (20261104090000), and a message can now
-- carry several cards: `card_ids`, drawn as small cards above the text.
-- `card_id` stays the first of them, for the builds that read only it.
--
-- Safe to run again.

begin;

alter table public.flare_messages
  add column if not exists card_ids uuid[] not null default '{}';

comment on column public.flare_messages.card_ids is
  'Every card this message offered or asked about, in order; card_id is the first. Empty for ordinary talk.';

-- The single-card messages written before this read as one-card lists.
update public.flare_messages
   set card_ids = array[card_id]
 where card_id is not null
   and cardinality(card_ids) = 0;

commit;
