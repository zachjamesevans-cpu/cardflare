-- Names that make the handle backfill work for its living.
--
-- Seeded before 20260918100000 runs, so the derivation and the collision
-- passes have real rows rather than an empty table to succeed against.
-- Run by scripts/probe-migrations.sh.
--
-- Every name here is one the CURRENT database would accept: display
-- names are unique, case-insensitively, until this migration drops that.
-- A first draft seeded both "Zach" and "ZACH" and the seed itself was
-- refused, which is the right answer — that state cannot exist, so
-- testing against it would have been testing a fiction.

begin;

insert into auth.users (id, email)
values
  ('11111111-1111-1111-1111-111111111111', 'zach@example.test'),
  ('11111111-1111-1111-1111-111111111112', 'stevenb@example.test'),
  ('11111111-1111-1111-1111-111111111113', 'steven.b@example.test'),
  ('11111111-1111-1111-1111-111111111114', 'stevenb2@example.test'),
  ('11111111-1111-1111-1111-111111111115', 'punct@example.test'),
  ('11111111-1111-1111-1111-111111111116', 'longest@example.test'),
  ('11111111-1111-1111-1111-111111111117', 'longer@example.test'),
  ('11111111-1111-1111-1111-111111111118', 'squatter@example.test');

insert into public.players (id, user_id, display_name, created_at)
values
  -- The oldest account, and the plain handle it should keep.
  ('22222222-2222-2222-2222-222222222221',
   '11111111-1111-1111-1111-111111111111', 'Zach',
   now() - interval '9 days'),

  -- The founder's own example: a space becomes an underscore.
  ('22222222-2222-2222-2222-222222222222',
   '11111111-1111-1111-1111-111111111112', 'Steven B',
   now() - interval '8 days'),

  -- A different name today, the same handle tomorrow. The numbering has
  -- to separate them, and the older one has to win.
  ('22222222-2222-2222-2222-222222222223',
   '11111111-1111-1111-1111-111111111113', 'Steven.B',
   now() - interval '7 days'),

  -- The one that forces a SECOND pass: the numbering above will hand
  -- `steven_b2` to Steven.B, and this account already derives to it.
  ('22222222-2222-2222-2222-222222222224',
   '11111111-1111-1111-1111-111111111114', 'Steven-B2',
   now() - interval '6 days'),

  -- Nothing survives the derivation at all: falls back to `player`.
  ('22222222-2222-2222-2222-222222222225',
   '11111111-1111-1111-1111-111111111115', '!!!',
   now() - interval '5 days'),

  -- Over twenty characters once derived, so it has to be cut — and cut
  -- again to leave room for a suffix when its twin collides.
  ('22222222-2222-2222-2222-222222222226',
   '11111111-1111-1111-1111-111111111116', 'A Very Long Name Indeed That Runs On',
   now() - interval '4 days'),
  ('22222222-2222-2222-2222-222222222227',
   '11111111-1111-1111-1111-111111111117', 'A Very Long Name Indeed That Also Runs',
   now() - interval '3 days'),

  -- Somebody already literally called "Zach2", from the day the name
  -- migration nudged a duplicate. Must keep it, and must not be trampled.
  ('22222222-2222-2222-2222-222222222228',
   '11111111-1111-1111-1111-111111111118', 'Zach2',
   now() - interval '2 days');

commit;
