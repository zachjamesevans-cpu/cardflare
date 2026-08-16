-- HTML art for cosmetics: the Figma exports that are not drawings.
--
-- The founder dropped in a ring built from spinning conic gradients,
-- blurs and @keyframes, with little SVG hands inside it, and the door
-- turned it away: "That component drew no SVG." His answer: "please
-- make it so I can just drop in the .tsx files."
--
-- So markup is the fourth art kind. It is drawn in a frame with
-- scripting switched off and a default-src 'none' policy - an iframe
-- without allow-scripts on the web, a WebView with JavaScript off in
-- the app - so CSS animates and nothing can execute or fetch.
--
-- html_path follows the same convention svg_path does: a storage
-- object for an upload, or a /-prefixed site path for art that ships
-- in the repo, told apart by the leading slash.

begin;

alter table public.cosmetics
  drop constraint if exists cosmetics_art_kind_check;

alter table public.cosmetics
  drop constraint if exists cosmetics_art_source_check;

alter table public.cosmetics
  add column if not exists html_path text;

alter table public.cosmetics
  alter column art_kind drop default;

alter table public.cosmetics
  add constraint cosmetics_art_kind_check
    check (art_kind in ('css', 'rive', 'svg', 'html'));

alter table public.cosmetics
  alter column art_kind set default 'css';

-- Each kind needs exactly its own art, and none of anyone else's.
alter table public.cosmetics
  add constraint cosmetics_art_source_check
    check (
      (art_kind = 'css'
        and rive_path is null and svg_path is null and html_path is null)
      or (art_kind = 'rive'
        and rive_path is not null and svg_path is null and html_path is null)
      or (art_kind = 'svg'
        and svg_path is not null and rive_path is null and html_path is null)
      or (art_kind = 'html'
        and html_path is not null and rive_path is null and svg_path is null)
    );

comment on column public.cosmetics.html_path is
  'Storage object for uploaded HTML art, or a /-prefixed path shipped in the repo.';

commit;
