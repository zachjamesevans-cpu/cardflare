-- What the poster will take: a trade, cash, or either.
--
-- The founder's case, and it cuts both ways. Somebody walking up to a
-- Flare needs to know whether to bring cards or twenty dollars, and
-- somebody clearing a binder needs to say "I will sell this" without
-- being read as "cards only". Today the app assumes every Flare is a
-- trade, which quietly excludes the whole population of players who
-- turn up with cash and no binder.
--
-- Two booleans rather than one enum. The honest shape of the answer is
-- a set, not a choice: "either is fine" is the common case and the one
-- that closes the most trades, and an enum would force it to be spelled
-- as a third member that then has to be special-cased everywhere the
-- other two are checked.
--
-- Deliberately NOT a price. A flag says something about the person
-- standing in the room; a number would make this a marketplace, drag in
-- Apple's rules about facilitating sales and disputes between users,
-- and break the no-prices rule the product has held since day one.
-- "This player will take cash" is a fact. "$45 OBO" is a listing.

begin;

alter table public.flares
  add column accepts_trade boolean not null default true,
  add column accepts_cash boolean not null default false;

comment on column public.flares.accepts_trade is
  'The poster will trade cards for this. Reads against the intent: on a want, "I will trade for it"; on a showcase, "I will trade it away".';

comment on column public.flares.accepts_cash is
  'The poster will use money for this. On a want, "I will buy it"; on a showcase, "I will sell it". Never a price.';

/*
 * A Flare that accepts neither is not a Flare, it is a card with no
 * way to answer it. The default keeps every existing row trade-only,
 * which is exactly what the board has meant until now.
 */
alter table public.flares
  add constraint flares_accepts_something
    check (accepts_trade or accepts_cash);

commit;
