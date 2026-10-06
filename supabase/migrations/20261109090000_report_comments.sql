-- Reporting a comment.
--
-- The pre-launch audit (App Store guideline 1.2): user content has to
-- be reportable where it is shown, and a comment under a post is user
-- content. A report now names a comment as its target too.
--
-- A comment can be taken down by its author or the post's owner, so
-- the line as it read when it was reported is kept on the report
-- (`target_excerpt`): the queue can show what was said after the row
-- itself is gone.

begin;

alter table public.player_reports
  drop constraint player_reports_kind;

alter table public.player_reports
  add constraint player_reports_kind
    check (target_kind in ('post', 'player', 'thread', 'comment'));

alter table public.player_reports
  add column target_excerpt text;

alter table public.player_reports
  add constraint player_reports_excerpt_short
    check (target_excerpt is null or char_length(target_excerpt) <= 500);

comment on column public.player_reports.target_excerpt is
  'What a reported comment said when it was reported, kept after the comment is deleted.';

commit;
