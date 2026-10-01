/*
 * Joining a room posts your Flares to it.
 *
 * The founder: "I wonder if it's best to just join a room and all the
 * flares immediately get posted. That's kinda the whole point of
 * cardflare." A Flare is already public on the Feed and on Nearby, so
 * the old "post all N to this room" button was asking a question the
 * player had answered when they posted. One switch stays, on by
 * default, for the person who wants to walk in and browse first.
 */

alter table public.players
  add column if not exists auto_post_flares boolean not null default true;

comment on column public.players.auto_post_flares is
  'Joining a room posts the player''s open Flares to its board. On by default.';
