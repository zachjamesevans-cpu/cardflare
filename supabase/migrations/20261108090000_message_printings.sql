-- The art a message's cards were offered in.
--
-- The founder: "Someone messaged me about my cards from my trade binder.
-- It was showing base art of the card in the chat but I selected alt art
-- in my binder." A message carried which CARD it was about and never
-- which PRINTING, so the chat drew the plainest printing. `printing_ids`
-- runs beside `card_ids`, one entry per card, null where any printing
-- will do.
--
-- Safe to run again.

begin;

alter table public.flare_messages
  add column if not exists printing_ids uuid[] not null default '{}';

comment on column public.flare_messages.printing_ids is
  'The printing of each card in card_ids, same order; a null entry means any printing. Empty for messages written before printings were kept.';

commit;
