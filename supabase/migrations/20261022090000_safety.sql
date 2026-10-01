-- Report and block.
--
-- The audit of 2026-10-01: "in-person meetings with strangers need a
-- safety valve", and the site had none. Two tables, both the player's
-- own word.
--
-- A block is one way: the blocker stops seeing the blocked player's
-- posts and comments, and neither can open a conversation with the
-- other. Nothing is announced. A report is a note to the admins about
-- a post, a player or a conversation, with a reason from a short list;
-- it lands in a queue on the admin console and is resolved by hand.

begin;

create table public.player_blocks (
  blocker_id uuid not null references public.players (id) on delete cascade,
  blocked_id uuid not null references public.players (id) on delete cascade,
  created_at timestamptz not null default now(),

  primary key (blocker_id, blocked_id),
  constraint player_blocks_no_self check (blocker_id <> blocked_id)
);

comment on table public.player_blocks is
  'One player hiding another. Posts and comments stop showing to the blocker; conversations refuse both ways. Never announced.';

create index player_blocks_blocked_idx on public.player_blocks (blocked_id);

create table public.player_reports (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),

  reporter_id uuid not null references public.players (id) on delete cascade,

  /* What was reported: a post (its batch id), a player, or a conversation. */
  target_kind text not null,
  target_id uuid not null,
  /* The player behind the target, resolved at report time, so the queue
     can group by person even after the post is gone. */
  target_player_id uuid references public.players (id) on delete set null,

  reason text not null,
  note text,

  status text not null default 'open',
  resolved_at timestamptz,
  resolved_by uuid references auth.users (id) on delete set null,

  constraint player_reports_kind check (target_kind in ('post', 'player', 'thread')),
  constraint player_reports_reason
    check (reason in ('spam', 'scam', 'harassment', 'other')),
  constraint player_reports_status check (status in ('open', 'resolved')),
  constraint player_reports_note_short check (note is null or char_length(note) <= 500)
);

comment on table public.player_reports is
  'A player telling the admins something is wrong. Open until an admin resolves it.';

create index player_reports_open_idx
  on public.player_reports (status, created_at desc);

/* Same stance as every table a player writes: RLS on, zero policies,
   privileges revoked. The server reads and writes after proving who
   is asking. */
alter table public.player_blocks enable row level security;
alter table public.player_reports enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['player_blocks', 'player_reports'] loop
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('revoke all on public.%I from anon', t);
    end if;
    if exists (select 1 from pg_roles where rolname = 'authenticated') then
      execute format('revoke all on public.%I from authenticated', t);
    end if;
  end loop;
end $$;

commit;
