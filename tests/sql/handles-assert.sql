-- What the handle backfill must have decided.

\echo '--- every account has a handle, and every handle is a legal one ---'
select
  count(*) filter (where handle is null) as missing,
  count(*) filter (where handle !~ '^[a-z0-9_]{3,20}$') as malformed,
  count(*) as accounts
from public.players;

\echo '--- no two accounts share one ---'
select count(*) as duplicated
from (
  select handle from public.players group by handle having count(*) > 1
) as clashes;

\echo '--- the derivation, name by name ---'
select display_name, handle
from public.players
order by created_at;

-- By seeded id, not by name: this file runs a second time to prove the
-- migration is re-runnable, and by then the checks below have added
-- another account called "Zach". Looking people up by display name is
-- exactly what stopped being reliable, which is the whole point.

\echo '--- the oldest of a colliding pair keeps the plain one ---'
select
  (select handle from public.players
    where id = '22222222-2222-2222-2222-222222222221') = 'zach'
    as oldest_zach_kept_it,
  (select handle from public.players
    where id = '22222222-2222-2222-2222-222222222222') = 'steven_b'
    as oldest_steven_kept_it;

\echo '--- a space became an underscore, not a gap ---'
select
  (select handle from public.players
    where id = '22222222-2222-2222-2222-222222222222') = 'steven_b'
    as space_became_underscore;

\echo '--- the second pass moved somebody off an already-taken suffix ---'
select
  (select handle from public.players
    where id = '22222222-2222-2222-2222-222222222223') as steven_dot,
  (select handle from public.players
    where id = '22222222-2222-2222-2222-222222222224') as steven_dash,
  (select handle from public.players
    where id = '22222222-2222-2222-2222-222222222223')
    <> (select handle from public.players
         where id = '22222222-2222-2222-2222-222222222224')
    as they_differ;

-- A spare account to try the refusals with. `players.user_id` has a
-- foreign key, so these cannot be invented on the spot. Both inserts
-- tolerate already having happened, because this file runs twice.
insert into auth.users (id, email)
values ('99999999-9999-9999-9999-999999999999', 'second.zach@example.test')
on conflict (id) do nothing;

\echo '--- display names may repeat again ---'
insert into public.players (user_id, display_name, handle)
values (
  '99999999-9999-9999-9999-999999999999', 'Zach', 'zach_the_second'
)
on conflict (user_id) do nothing;
select count(*) as accounts_named_zach
from public.players
where display_name = 'Zach';

\echo '--- but handles may not ---'
do $$ begin
  insert into public.players (user_id, display_name, handle)
  values (gen_random_uuid(), 'Impostor', 'zach');
  raise exception 'a duplicate handle was accepted';
exception
  when unique_violation then
    raise notice 'duplicate handle refused, as it should be';
  when foreign_key_violation then
    raise exception 'the fixture is wrong, not the schema';
end $$;

\echo '--- and a handle with a space in it is refused ---'
do $$ begin
  insert into public.players (user_id, display_name, handle)
  values (gen_random_uuid(), 'Spacey', 'has space');
  raise exception 'a handle with a space was accepted';
exception
  when check_violation then
    raise notice 'spaced handle refused, as it should be';
end $$;

\echo '--- the derivation function itself ---'
select
  public.handle_from('Steven B') as spaced,
  public.handle_from('  Zach  ') as padded,
  public.handle_from('ZACH') as shouty,
  public.handle_from('a---b') as runs,
  public.handle_from('!!!') as nothing_left,
  public.handle_from('A Very Long Name Indeed That Runs On') as truncated;
