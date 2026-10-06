-- One rate limit for the whole fleet, not one per warm function.
--
-- src/lib/rate-limit.ts counted in memory. On Vercel every warm
-- instance kept its own count, so "10 conversations an hour" was 10 per
-- instance per hour, and a script that spread its requests across a
-- cold start or two got a multiple of every ceiling for free.
--
-- The counter lives here now: one row per key per fixed window, bumped
-- by one atomic upsert. The in-memory limiter still makes the decision
-- in-line (its callers are synchronous), and learns from this table's
-- answer that a key is over the shared ceiling; see rate-limit.ts.
--
-- Service role only. The function is `security definer` with a pinned
-- search_path, and EXECUTE is taken from anon and authenticated (a
-- revoke from PUBLIC alone is not enough on Supabase, see
-- 20261109093100_lock_definer_functions.sql). The table has RLS on and
-- no policies, and the client roles hold no grants on it.
--
-- Safe to run again.

begin;

create table if not exists public.rate_limit_hits (
  key text not null,
  window_start timestamptz not null,
  hits integer not null default 0,
  primary key (key, window_start)
);

comment on table public.rate_limit_hits is
  'Fixed-window request counts shared by every server instance. Written only through rate_limit_hit(); rows older than a day are swept by the function itself.';

alter table public.rate_limit_hits enable row level security;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on public.rate_limit_hits from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on public.rate_limit_hits from authenticated;
  end if;
end
$$;

/*
 * Counts one hit against a key in the current window and answers with
 * the count so far and when the window resets. Windows are aligned to
 * the epoch, so every instance agrees on where one ends without having
 * to agree on when it began.
 */
create or replace function public.rate_limit_hit(p_key text, p_window_ms integer)
returns table (hits integer, resets_at timestamptz)
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
#variable_conflict use_column
declare
  v_ms bigint := greatest(p_window_ms, 1000);
  v_start timestamptz;
begin
  v_start := to_timestamp(
    (floor(extract(epoch from now()) * 1000 / v_ms) * v_ms) / 1000.0
  );

  insert into public.rate_limit_hits as r (key, window_start, hits)
  values (left(p_key, 200), v_start, 1)
  on conflict (key, window_start) do update set hits = r.hits + 1
  returning r.hits, v_start + make_interval(secs => v_ms / 1000.0)
  into hits, resets_at;

  /* Housekeeping without a cron: about one call in a hundred clears
     windows that ended more than a day ago. */
  if random() < 0.01 then
    delete from public.rate_limit_hits where window_start < now() - interval '1 day';
  end if;

  return next;
end;
$function$;

comment on function public.rate_limit_hit(text, integer) is
  'Counts one hit for a key in the current fixed window and returns the count and the reset time. Service role only.';

revoke all on function public.rate_limit_hit(text, integer) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on function public.rate_limit_hit(text, integer) from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on function public.rate_limit_hit(text, integer) from authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.rate_limit_hit(text, integer) to service_role;
  end if;
end
$$;

commit;
