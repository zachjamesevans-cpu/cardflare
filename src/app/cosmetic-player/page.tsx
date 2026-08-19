import type { Metadata } from "next";

import { RiveArt } from "@/components/players/rive-art";

/**
 * One Rive cosmetic, playing on its own, for the app to put in a frame.
 *
 * WHY THIS PAGE EXISTS. A Rive cosmetic animates on the website and drew
 * nothing at all on a phone. The app renders uploaded art in a WebView
 * with JavaScript OFF - which is the right containment for an SVG or a
 * page of HTML somebody uploaded, and is fatal for Rive, because a .riv
 * file is played BY a runtime rather than being a picture. So
 * `cosmetic-film.tsx` returned null for the whole kind, and a founder
 * wearing one saw a bare avatar and reasonably concluded the app was
 * broken.
 *
 * The distinction this page turns on: the .riv file is DATA, and the
 * only code that runs is OURS. The app loads this page - our origin,
 * our bundle, our WASM copied out of the installed package - and hands
 * it a path to play. Nothing an uploader supplied ever becomes script.
 * That is a different bargain from switching JavaScript on for an
 * uploaded document, which stays off and always will.
 *
 * Same runtime as the website's, deliberately: `RiveArt` is the
 * component a profile already uses, so a cosmetic cannot look like two
 * different things on the two platforms.
 */

export const metadata: Metadata = {
  title: "Cosmetic",
  /* Nothing here is for a person browsing, and a search result pointing
     at a bare animation helps nobody. */
  robots: { index: false, follow: false },
};

/**
 * Which paths may be played.
 *
 * A path on OUR origin, and only from the two places cosmetic art can
 * legitimately live: the storage proxy, and art seeded into the repo by
 * a migration. Without this the page is a general-purpose loader for
 * any URL anybody puts in a query string, which is somebody else's
 * bandwidth and our domain in the address bar.
 */
export function playablePath(src: string | undefined): string | null {
  if (!src) return null;
  if (!src.startsWith("/api/avatars/") && !src.startsWith("/cosmetics/")) {
    return null;
  }
  /* No scheme-relative "//evil.example" smuggled past the check above. */
  if (src.startsWith("//")) return null;
  return src;
}

const one = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value;

export default async function CosmeticPlayerPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const src = playablePath(one(params.src));
  const artboard = one(params.artboard) ?? null;
  const stateMachine = one(params.machine) ?? null;
  const fit = one(params.fit) === "cover" ? "cover" : "contain";

  return (
    <>
      {/*
       * The page is a hole, not a document. The app puts it over an
       * avatar, so anything this paints - the site's background, the
       * body's flex column, a margin - lands on somebody's face.
       */}
      <style>{`
        html, body { background: transparent !important; margin: 0; padding: 0;
                     height: 100%; overflow: hidden; }
        body { display: block !important; }
      `}</style>
      <div
        style={{
          position: "fixed",
          inset: 0,
          background: "transparent",
          pointerEvents: "none",
        }}
      >
        {/* A missing or disallowed src draws nothing, the same failure
            an unloadable file already has: the thing underneath is
            still there and still readable. */}
        {src ? (
          <RiveArt
            url={src}
            artboard={artboard}
            stateMachine={stateMachine}
            fit={fit}
          />
        ) : null}
      </div>
    </>
  );
}
