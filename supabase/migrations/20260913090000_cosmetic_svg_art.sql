-- SVG art for cosmetics, and the first one: the founder's Figma export.
--
-- His ask: "working with figma files with their src/ tsx file type...
-- make this available in the upload new customization thing so multiple
-- file types can be supported."
--
-- A Figma .tsx export is a React component that draws an SVG. Converted
-- once, it IS an SVG - so the third art kind is 'svg', and both a .svg
-- upload and a converted .tsx land in the same shape. The conversion
-- happens in the console, in the founder's own browser: nothing that
-- arrives in a file upload should ever run in the process that holds
-- the service-role key.
--
-- svg_path is either a storage object (cosmetics/<slug>-<ts>.svg, what
-- the console uploads) or a site-relative path (/cosmetics/<slug>.svg,
-- for art that ships in the repo because a migration cannot carry a
-- file with it). The resolver tells them apart by the leading slash.

begin;

alter table public.cosmetics
  drop constraint if exists cosmetics_art_kind_check;

alter table public.cosmetics
  drop constraint if exists cosmetics_rive_art_check;

alter table public.cosmetics
  add column if not exists svg_path text;

-- The kind, now three ways.
alter table public.cosmetics
  alter column art_kind drop default;

alter table public.cosmetics
  add constraint cosmetics_art_kind_check
    check (art_kind in ('css', 'rive', 'svg'));

alter table public.cosmetics
  alter column art_kind set default 'css';

-- Each kind needs exactly its own art, and none of anyone else's.
alter table public.cosmetics
  add constraint cosmetics_art_source_check
    check (
      (art_kind = 'css' and rive_path is null and svg_path is null)
      or (art_kind = 'rive' and rive_path is not null and svg_path is null)
      or (art_kind = 'svg' and svg_path is not null and rive_path is null)
    );

comment on column public.cosmetics.svg_path is
  'Storage object for an uploaded drawing, or a /-prefixed path shipped in the repo.';

-- The founder's lightning ring, converted from his Figma .tsx and
-- shipped at public/cosmetics/ring-lightning.svg. Draft, like every
-- new cosmetic: he sets it live from the console grid.
insert into public.cosmetics
  (slug, kind, name, description, cost_embers, requires_earned, sort_order, status,
   art_kind, svg_path)
values
  ('ring-lightning', 'ring', 'Lightning',
   'Red arcs cracking around the picture.', 0, null, 260, 'draft',
   'svg', '/cosmetics/ring-lightning.svg')
on conflict (slug) do nothing;

commit;
