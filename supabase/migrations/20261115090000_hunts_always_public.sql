-- Every hunt is public.
--
-- The founder: "hunts should default to public and only be public.
-- there is zero reason to keep a hunt private - it's the whole point of
-- a hunt." The server writes 'public' on every create and ignores a
-- visibility on update (src/lib/players/hunts.ts); this turns the hunts
-- already marked private public to match. The column stays, so a build
-- that still sends or reads it keeps working.

update public.hunts
   set visibility = 'public'
 where visibility is distinct from 'public';
