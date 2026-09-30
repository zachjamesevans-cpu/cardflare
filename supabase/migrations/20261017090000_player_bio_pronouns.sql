/*
 * Bio and pronouns, on the profile.
 *
 * The founder, holding up Instagram's Edit profile: name, username,
 * pronouns, bio, in that order. The first two existed; these are the
 * other two. Both optional, both short, both public: a bio is the line
 * under your name that says what you play and what you are after, and
 * pronouns are how the room should say it.
 *
 * Ceilings as check constraints so the column can never hold more than
 * a profile can draw, whichever client wrote it. The application
 * mirrors them in `src/lib/players/profile-schema.ts`.
 */

alter table public.players add column if not exists bio text;
alter table public.players add column if not exists pronouns text;

alter table public.players
  drop constraint if exists players_bio_length,
  add constraint players_bio_length check (bio is null or char_length(bio) <= 150);

alter table public.players
  drop constraint if exists players_pronouns_length,
  add constraint players_pronouns_length
    check (pronouns is null or char_length(pronouns) <= 20);

comment on column public.players.bio is
  'A short public line under the name. Up to 150 characters; null when unset.';
comment on column public.players.pronouns is
  'How to refer to the player, e.g. he/him. Up to 20 characters; null when unset.';
