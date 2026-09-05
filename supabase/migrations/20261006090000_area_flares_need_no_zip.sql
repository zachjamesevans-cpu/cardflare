-- An area Flare no longer needs a ZIP.
--
-- The ZIP was Local's anchor: a Flare posted with no room had to say
-- roughly where it was so Local could show it to the people nearby.
-- Local is switched off (src/lib/local/enabled.ts), and a Flare with
-- no room now goes to the poster's friends in the Feed, who are found
-- by friendship and not by distance. The founder, on the leftover
-- prompt: "No need to have that requirement now because it just shows
-- your flares to your friends in the feed."
--
-- So the two-shapes check keeps everything that made it safe, and
-- drops the one demand that stopped a signed-in player posting: an
-- area Flare is still a player's own row with no board, but its ZIP
-- is optional. One that has a ZIP still gets it, from the profile or
-- from a granted position snapped to a centroid, so Local can pick it
-- up again the day it is switched back on. One without simply stays
-- out of Local's radius until its poster adds one.

begin;

alter table public.flares
  drop constraint if exists flares_belongs_to_a_board_or_an_area;

alter table public.flares
  add constraint flares_belongs_to_a_board_or_an_area
    check (
      (
        event_id is not null
        and player_session_id is not null
        and player_id is null
        and posted_postal_code is null
      )
      or (
        event_id is null
        and player_session_id is null
        and player_id is not null
      )
    );

comment on column public.flares.posted_postal_code is
  'The poster''s own five-digit ZIP, for an area Flare, when they have one. Resolved to a centroid at read time; never a precise position. Null keeps the Flare out of Local''s radius and nowhere else.';

commit;
