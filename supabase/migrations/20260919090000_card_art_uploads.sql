-- Card art we host ourselves, for sets no provider covers yet.
--
-- Every card image so far has come from optcgapi and been rendered
-- straight from their host, which costs CardFlare nothing and is the
-- right arrangement while a provider has the set. OP-17 is not in any
-- provider yet, and a spoiler image from a fan site cannot be hotlinked
-- for the same reason avatars cannot: the founder's phone does not
-- reliably fetch third-party hosts. It has to be ours and it has to be
-- served from our origin.
--
-- So `image_url` gains one more legal shape. It stays "provider-supplied
-- only, never constructed" for anything absolute; the new form is a path
-- on our own domain, which is not a third-party reference at all.
--
-- Deliberately NOT a second column. Eight read sites already select
-- `image_url` and pass it straight through to a renderer, and a parallel
-- column would mean finding all eight and remembering the ninth. A
-- relative path travels the existing pipe untouched.

begin;

/* -------------------------------------------------------------------------- */
/* 1. The bucket                                                               */
/* -------------------------------------------------------------------------- */

/*
 * Private, unlike avatars. Nothing reads it directly — the serving route
 * downloads with the service role and streams the bytes, so the bucket
 * being public would grant access nobody uses. Guarded on the storage
 * schema existing so this still applies against the bare PostgreSQL the
 * migration probe runs on.
 *
 * Five megabytes: a card scan is a few hundred kilobytes and this is the
 * ceiling that says so, not a target.
 */
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('card-art', 'card-art', false, 5242880,
            array['image/png', 'image/jpeg', 'image/webp'])
    on conflict (id) do update
      set public = false,
          file_size_limit = 5242880,
          allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp'];
  end if;
end $$;

/* -------------------------------------------------------------------------- */
/* 2. One more legal shape for image_url                                       */
/* -------------------------------------------------------------------------- */

/*
 * `/api/card-art/...` and nothing else. Narrow on purpose: a bare
 * "starts with a slash" would admit `//evil.example`, which a browser
 * reads as a protocol-relative URL pointing at somebody else's server.
 *
 * The `..` exclusion is separate from the character class rather than
 * folded into it, because a dot is legitimately needed for the file
 * extension. A first draft allowed `[A-Za-z0-9._/-]` and nothing else,
 * and the probe walked `/api/card-art/../../etc/passwd` straight
 * through it — every character in that string is in the class. Two
 * conditions, one of which is obviously about traversal.
 *
 * The application re-checks the same shape in `isRenderableImageUrl`
 * before rendering, and the serving route validates every segment
 * again before touching storage.
 */
alter table public.card_printings
  drop constraint if exists card_printings_image_is_https;

do $$ begin
  alter table public.card_printings
    add constraint card_printings_image_is_https
    check (
      image_url is null
      or image_url like 'https://%'
      or (
        image_url ~ '^/api/card-art/[A-Za-z0-9._/-]+$'
        and image_url not like '%..%'
      )
    );
exception
  when duplicate_object then null;
end $$;

comment on column public.card_printings.image_url is
  'Either a provider-supplied https URL, never inferred or rewritten, or a path under /api/card-art for art CardFlare hosts itself. Display is gated by NEXT_PUBLIC_ENABLE_CARD_IMAGES.';

/* -------------------------------------------------------------------------- */
/* 3. Finding hosted art again                                                 */
/* -------------------------------------------------------------------------- */

/*
 * The swap this exists for. When a provider finally ships OP-17 with
 * real artwork, its sync writes its own printings under its own provider
 * key, and the placeholders are removed by deleting every printing this
 * import produced:
 *
 *   delete from public.card_printings
 *    where provider_key = 'kaizoku' and set_code = 'OP17';
 *
 * The `cards` rows need no cleanup: they are keyed on game and card
 * number, so the provider's sync updates them in place and takes over
 * provenance on the way past.
 */
create index if not exists card_printings_provider_set_idx
  on public.card_printings (provider_key, set_code);

commit;
