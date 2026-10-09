-- Binders I'm Bringing: which of a player's binders they mean to carry
-- to one Night.
--
-- The founder (2026-10-09): "When someone RSVPs 'Going' to a Night,
-- they should have the option to select which of their existing
-- digital binders they're bringing to that event... Selecting a binder
-- for one Night must not automatically select it for every future
-- event... Binder content should remain linked to the existing binder
-- data. Avoid unnecessarily duplicating entire card collections."
--
-- So a row is a pointer and nothing more: this night, this binder,
-- whose it is. The cards stay in binder_cards and are read through the
-- pointer, so an edit to the binder shows at the night at once. A row
-- per night means the next night starts with nothing picked.
--
-- event_only is the explicit, per-night choice to let THIS night's
-- attendees see a binder that is otherwise private. The founder: "Do
-- not automatically expose private binders. If private binders can be
-- selected, require an explicit, clearly explained event-only
-- visibility choice. Preserve existing profile and binder privacy
-- settings." It changes nothing on the binder itself; a binder up for
-- trade is public already and needs no such choice.
--
-- Rows outlive the night on purpose: they are the record of what was
-- brought. Who may see them is decided at read time from the room's
-- phase, so a finished night shows nobody's binders to anybody.
--
-- Service role only, like every table a player session writes: RLS is
-- on with no policies, and the server proves who is asking.
begin;

create table if not exists public.night_binders (
  event_id uuid not null references public.events(id) on delete cascade,
  binder_id uuid not null references public.binders(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  event_only boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (event_id, binder_id)
);

comment on table public.night_binders is
  'A binder a player says they are bringing to one Night. A pointer to binders; the cards are read from binder_cards.';
comment on column public.night_binders.event_only is
  'The owner chose to show this binder to this Night''s attendees although it is private. Never changes the binder''s own privacy.';

create index if not exists night_binders_player_idx
  on public.night_binders (player_id, event_id);

alter table public.night_binders enable row level security;

commit;
