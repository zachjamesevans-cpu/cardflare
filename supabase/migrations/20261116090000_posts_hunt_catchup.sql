-- A post in a hunt, named as one, all the way back.
--
-- The Feed now says "is hunting Ace <3" on a post that went up in a
-- hunt, read off flare_posts.hunt_id (the founder: "make it
-- retroactive"). Every post since 20261013090000 records its hunt when
-- it is made, and that migration's backfill gave older posts one. But a
-- post whose hunt_id is empty while every card on it answers a request
-- of ONE hunt, owned by the person who posted it, is plainly a post in
-- that hunt; this names it.
--
-- Only an empty hunt_id is touched, only when there is exactly one hunt
-- behind every card of the post, and only the poster's own hunt. Run it
-- twice and the second run changes nothing.

update public.flare_posts p
   set hunt_id = linked.hunt_id
  from (
    select f.posted_batch as post_id,
           min(r.hunt_id::text)::uuid as hunt_id
      from public.flares f
      join public.hunt_requests r on r.id = f.hunt_request_id
     where f.posted_batch is not null
     group by f.posted_batch
    having count(distinct r.hunt_id) = 1
       /* Every card on the post answers that hunt, not just some. */
       and count(*) = (
             select count(*)
               from public.flares all_cards
              where all_cards.posted_batch = f.posted_batch
           )
  ) linked
  join public.hunts h on h.id = linked.hunt_id
 where p.id = linked.post_id
   and p.hunt_id is null
   and h.player_id = p.player_id;
