-- The admin round of the 2026-10-01 audit.
--
-- Three things the audit found in the data, and one it found missing:
--
--   1. Set codes spelled two ways ("OP-02" and "OP02"), so the Sets
--      list counted every One Piece set twice. Bandai writes the dash;
--      the dash is canonical from here on, and the sync writes it.
--   2. Card names carrying their own number ("Trafalgar Law - OP14-009"),
--      which the tile then printed twice. The number has a column.
--   3. The spot check had no pass or fail, so nothing was ever marked
--      red. A verdict per card, by whoever read it against a real card.
--
-- Duplicate stores are merged by hand from the store's page, not here:
-- a merge is a judgement, and this file is not where judgements go.

begin;

/* -------------------------------------------------------------------------- */
/* 1. One spelling per set                                                    */
/* -------------------------------------------------------------------------- */

update public.card_printings
set printing_label = regexp_replace(printing_label, '^(OP|ST|EB|PRB)(\d+)$', '\1-\2')
where printing_label ~ '^(OP|ST|EB|PRB)\d+$';

update public.card_printings
set set_code = regexp_replace(set_code, '^(OP|ST|EB|PRB)(\d+)$', '\1-\2')
where set_code ~ '^(OP|ST|EB|PRB)\d+$';

/* -------------------------------------------------------------------------- */
/* 2. A name is a name                                                        */
/* -------------------------------------------------------------------------- */

update public.cards
set
  exact_name = btrim(regexp_replace(exact_name, '\s*[-–—]?\s*' || canonical_card_number || '\s*$', '', 'i')),
  normalized_name = btrim(
    regexp_replace(
      regexp_replace(
        lower(btrim(regexp_replace(exact_name, '\s*[-–—]?\s*' || canonical_card_number || '\s*$', '', 'i'))),
        '[^[:alnum:][:space:]]', ' ', 'g'
      ),
      '\s+', ' ', 'g'
    )
  )
where exact_name ~* ('\s*[-–—]?\s*' || canonical_card_number || '\s*$')
  and btrim(regexp_replace(exact_name, '\s*[-–—]?\s*' || canonical_card_number || '\s*$', '', 'i')) <> '';

/* -------------------------------------------------------------------------- */
/* 3. The spot check keeps score                                              */
/* -------------------------------------------------------------------------- */

create table public.card_spot_checks (
  card_id uuid primary key references public.cards (id) on delete cascade,
  verdict text not null,
  note text,
  checked_at timestamptz not null default now(),
  checked_by uuid references auth.users (id) on delete set null,

  constraint card_spot_checks_verdict check (verdict in ('ok', 'wrong')),
  constraint card_spot_checks_note_short check (note is null or char_length(note) <= 200)
);

comment on table public.card_spot_checks is
  'An admin''s verdict on one card after reading it against the real one. "wrong" is what the dashboard counts in red.';

alter table public.card_spot_checks enable row level security;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on public.card_spot_checks from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on public.card_spot_checks from authenticated;
  end if;
end $$;

commit;
