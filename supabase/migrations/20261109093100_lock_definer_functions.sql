-- Definer functions answer to the service role, and nobody else.
--
-- Every one of these was created with `revoke all ... from public` and
-- nothing more. That is not enough on Supabase: the platform's default
-- privileges grant EXECUTE on new functions in `public` directly to
-- `anon` and `authenticated`, and a revoke from PUBLIC does not touch a
-- direct grant. So anyone holding the anon key could call
-- `grant_embers` through PostgREST and mint themselves Embers, or
-- `binder_place_card` and rearrange a stranger's binder. They run as
-- the owner, so RLS does not stand in the way.
--
-- The app reaches every one of them through the service-role client
-- (`getSupabaseAdmin().rpc(...)`), never from a browser or the phone,
-- so taking them away from the two client roles costs nothing:
--
--   grant_embers(uuid, integer, text, text)          src/lib/players/embers.ts
--   award_embers(uuid, integer, text, text, text)    src/lib/players/embers.ts
--   spend_embers(uuid, integer, text, text)          src/lib/players/embers.ts
--   reverse_embers(uuid, integer, text, text)        src/lib/players/embers.ts
--   binder_place_card(uuid, uuid, integer)           src/lib/binder/binder.ts
--   binder_save_order(uuid, uuid[])                  src/lib/binder/binder.ts
--
-- Every other `security definer` function in the migrations was checked:
--   merge_player_sessions(uuid, uuid) - already revoked from anon and
--                                       authenticated where it was made.
--   is_admin(), is_store_member(uuid) - deliberately granted to
--                                       authenticated: RLS policies call
--                                       them as the signed-in user, and
--                                       they only answer yes/no about
--                                       the caller. Left alone.
--
-- Guarded on the roles existing, so the migration still applies against
-- the bare PostgreSQL used for probing. Safe to run again.

begin;

do $$
declare
  fn text;
  fns text[] := array[
    'public.grant_embers(uuid, integer, text, text)',
    'public.award_embers(uuid, integer, text, text, text)',
    'public.spend_embers(uuid, integer, text, text)',
    'public.reverse_embers(uuid, integer, text, text)',
    'public.binder_place_card(uuid, uuid, integer)',
    'public.binder_save_order(uuid, uuid[])'
  ];
begin
  foreach fn in array fns loop
    execute format('revoke all on function %s from public', fn);
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('revoke all on function %s from anon', fn);
    end if;
    if exists (select 1 from pg_roles where rolname = 'authenticated') then
      execute format('revoke all on function %s from authenticated', fn);
    end if;
    if exists (select 1 from pg_roles where rolname = 'service_role') then
      execute format('grant execute on function %s to service_role', fn);
    end if;
  end loop;
end
$$;

commit;
