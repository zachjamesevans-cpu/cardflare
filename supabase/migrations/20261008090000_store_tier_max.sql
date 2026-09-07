-- The store tier learns 'max'.
--
-- `stores.tier` was created with 'free' and 'ultra' when the directory
-- badge was the only reader. The money table has always sold two store
-- tiers, Ultra for shops and Max for vendors, and the webhook now
-- writes the column from the subscription, so it has to be able to say
-- what a vendor paid for.
--
-- No begin/commit: a value added to an enum cannot be used in the same
-- transaction that adds it, and this file is one statement.

alter type public.store_tier add value if not exists 'max';
