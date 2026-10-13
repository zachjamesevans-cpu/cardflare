-- A binder can be public without being up for trade.
--
-- The founder: "we need a public/private toggle for binders. sometimes
-- you don't necessarily want something up for trade, but also want it
-- visible on your profile". `is_public` has existed since custom binders
-- (20261026090000) but the code wrote it as a copy of `for_trade` and
-- read only `for_trade`, so the two were one switch. From now on anybody
-- may see a binder that is public OR for trade (a trade binder is public
-- by definition), and the owner turns `is_public` on its own.
--
-- Before that starts to matter, line the column up with what each player
-- actually chose: a binder that was never for trade was never visible,
-- and the column's `default true` must not now publish it.

update public.binders
   set is_public = for_trade
 where is_public is distinct from for_trade;

comment on column public.binders.is_public is
  'Shown on the owner''s profile to anyone. A for_trade binder is always public; a private one is never for trade.';
