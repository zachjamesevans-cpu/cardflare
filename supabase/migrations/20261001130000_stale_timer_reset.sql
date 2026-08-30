-- The overnight failsafe writes its own line in the timer log, so
-- "where did last night's timer go" has an answer: it went to Ready,
-- six hours after its round ended, because nobody was coming back.
alter table public.event_hub_timer_log
  drop constraint event_hub_timer_log_kind;

alter table public.event_hub_timer_log
  add constraint event_hub_timer_log_kind
    check (kind in (
      'round-started', 'auto-held', 'auto-resumed', 'auto-extended',
      'auto-on', 'auto-off', 'stale-reset'
    ));
