-- Rive art for cosmetics: drop in a .riv file and it is the cosmetic.
--
-- The founder's ask: "the ability to drop these files into any of the
-- customization categories, and the ability to name them, and choose
-- when they're live, and add them to the pack distribution list... the
-- goal is to be able to drop these files in at will, they just work."
--
-- So a cosmetic now says HOW it is drawn. 'css' is everything built so
-- far (a .cfa- rule in cosmetic-art.css); 'rive' means the art is the
-- uploaded file at rive_path, and no CSS rule exists or is expected.
-- Everything else about a cosmetic is unchanged, which is the point:
-- status, packs, ownership and equipping already work, and a Rive item
-- rides all of it without a special case.

begin;

alter table public.cosmetics
  add column if not exists art_kind text not null default 'css'
    check (art_kind in ('css', 'rive'));

-- Storage object path in the avatars bucket, e.g. cosmetics/<slug>-<ts>.riv
alter table public.cosmetics
  add column if not exists rive_path text;

-- Which artboard and state machine to play, or null for the file's
-- defaults. Named rather than guessed: one .riv can hold several.
alter table public.cosmetics
  add column if not exists rive_artboard text;

alter table public.cosmetics
  add column if not exists rive_state_machine text;

-- A Rive cosmetic without a file is a broken tile, and a CSS cosmetic
-- with one is a contradiction. The database refuses both.
alter table public.cosmetics
  drop constraint if exists cosmetics_rive_art_check;

alter table public.cosmetics
  add constraint cosmetics_rive_art_check
    check (
      (art_kind = 'rive' and rive_path is not null)
      or (art_kind = 'css' and rive_path is null)
    );

comment on column public.cosmetics.art_kind is
  'css: a .cfa- rule in cosmetic-art.css. rive: the uploaded file at rive_path.';

commit;
