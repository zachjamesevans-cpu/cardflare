-- What the loosened image_url rule must and must not allow.

\echo '--- the rows that were already there came through untouched ---'
select provider_key, set_code, image_url
from public.card_printings
order by provider_external_id;

\echo '--- a path on our own origin is now accepted ---'
update public.card_printings
   set image_url = '/api/card-art/kaizoku/op17/OP17-001.png'
 where id = '44444444-4444-4444-4444-444444444442';

select image_url as hosted
from public.card_printings
where id = '44444444-4444-4444-4444-444444444442';

\echo '--- a provider URL is still accepted ---'
do $$ begin
  update public.card_printings
     set image_url = 'https://optcgapi.com/images/OP01-025.png'
   where id = '44444444-4444-4444-4444-444444444441';
  raise notice 'https still accepted, as it should be';
end $$;

\echo '--- a protocol-relative URL is refused ---'
-- The one that matters. A bare "starts with a slash" rule would let this
-- through, and a browser reads it as a pointer at somebody else's server.
do $$ begin
  update public.card_printings
     set image_url = '//evil.example/op17.png'
   where id = '44444444-4444-4444-4444-444444444442';
  raise exception 'a protocol-relative URL was accepted';
exception
  when check_violation then
    raise notice 'protocol-relative refused, as it should be';
end $$;

\echo '--- a path outside the card-art route is refused ---'
do $$ begin
  update public.card_printings
     set image_url = '/api/avatars/someone.png'
   where id = '44444444-4444-4444-4444-444444444442';
  raise exception 'a non-card-art path was accepted';
exception
  when check_violation then
    raise notice 'foreign path refused, as it should be';
end $$;

\echo '--- traversal out of the bucket is refused ---'
do $$ begin
  update public.card_printings
     set image_url = '/api/card-art/../../etc/passwd'
   where id = '44444444-4444-4444-4444-444444444442';
  raise exception 'a traversal path was accepted';
exception
  when check_violation then
    raise notice 'traversal refused, as it should be';
end $$;

\echo '--- plain http is still refused ---'
do $$ begin
  update public.card_printings
     set image_url = 'http://optcgapi.com/images/OP01-025.png'
   where id = '44444444-4444-4444-4444-444444444442';
  raise exception 'plain http was accepted';
exception
  when check_violation then
    raise notice 'http refused, as it should be';
end $$;

\echo '--- the swap that retires hosted art is a single statement ---'
select count(*) as kaizoku_printings_for_op17
from public.card_printings
where provider_key = 'kaizoku' and set_code = 'OP17';
