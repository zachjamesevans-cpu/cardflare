-- An unclaimed listing has no contact email, and must not invent one.
--
-- `stores.contact_email` has been `not null` with an email-shape check
-- since the first migration, and rightly so: every store in CardFlare was
-- a customer somebody had emailed. The directory changes that. A shop
-- discovered from a places provider has an address and a phone number
-- and nobody who has agreed to hear from us.
--
-- The import passed an empty string, which is exactly the wrong answer -
-- it fails `stores_contact_email_shape`, and if it had passed it would
-- have left a falsy value that reads as "we have an address" everywhere
-- that checks for one. Thirty-five inserts failed on this, one per
-- candidate, which is how it was found.
--
-- So the column becomes nullable and both checks learn to allow null.
-- NULL means "nobody has told us", which is the truth about an unclaimed
-- listing, and it is a value the type system and the UI can both see -
-- unlike "".
--
-- Existing rows are untouched: every store that has an address keeps it,
-- and the shape check still applies to every non-null value.

begin;

alter table public.stores
  alter column contact_email drop not null;

alter table public.stores
  drop constraint if exists stores_contact_email_shape;

alter table public.stores
  add constraint stores_contact_email_shape check (
    contact_email is null
    or contact_email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
  );

alter table public.stores
  drop constraint if exists stores_contact_email_is_normalized;

alter table public.stores
  add constraint stores_contact_email_is_normalized check (
    contact_email is null or contact_email = lower(btrim(contact_email))
  );

commit;
