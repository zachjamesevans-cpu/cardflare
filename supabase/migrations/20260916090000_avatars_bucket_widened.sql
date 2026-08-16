-- The avatars bucket has to accept what we now put in it.
--
-- The founder uploaded a GIF and got "Something went wrong. Please try
-- again in a moment." The decode was fine by then; Supabase Storage
-- refused the write, because this bucket was created with
-- allowed_mime_types = png/jpeg/webp and a 2MB ceiling, back when a
-- profile picture was the only thing that ever landed in it.
--
-- Since then it has grown two more jobs and neither was declared here:
--   image/gif                 - animated avatars, for pro and up.
--   image/svg+xml, text/html  - dropped-in cosmetic art, which lives
--                               under cosmetics/ in this same bucket.
--   application/octet-stream  - the .riv files already in the
--                               catalogue. Nothing new arrives as
--                               Rive, but what is there must stay
--                               replaceable.
--
-- The size ceiling moves to 8MB to cover the largest of those: a
-- re-encoded animation is capped at 3MB by the application and a .riv
-- at 4MB, so this leaves headroom without becoming a place to park a
-- video. The application's own limits stay the real ones; this is the
-- floor beneath them.
--
-- Guarded on the storage schema existing, so the migration still
-- applies against the bare PostgreSQL used for probing.

begin;

do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    update storage.buckets
       set file_size_limit = 8388608,
           allowed_mime_types = array[
             'image/png',
             'image/jpeg',
             'image/webp',
             'image/gif',
             'image/svg+xml',
             'text/html',
             'application/octet-stream'
           ]
     where id = 'avatars';
  end if;
end $$;

commit;
