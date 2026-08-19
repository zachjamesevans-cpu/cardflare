import type { Metadata } from "next";

import { RiveArt } from "@/components/players/rive-art";

/**
 * One cosmetic's uploaded art, on a page of its own, for the app.
 *
 * WHY THE APP NEEDS A PAGE AT ALL. The website draws uploaded art
 * inline: an `<img>` for a drawing, a sandboxed `<iframe>` for markup, a
 * canvas for Rive. React Native has none of those, only a WebView, and
 * the app's first answer was to hand that WebView an HTML STRING it
 * built itself. That works in Chromium and is a trap on iOS: a string
 * loaded with no base URL gets an opaque origin, and an opaque-origin
 * document is not a reliable place to fetch an https subresource from.
 * Same file, same URL, renders on the website and blank on a phone.
 *
 * So the app stops inventing documents. It points at this URL, which is
 * a real page on our own origin, and what it gets back is the same
 * three renderers the website uses. One place to be right.
 *
 * Rive additionally needs SCRIPT - a .riv is played by a runtime rather
 * than decoded like a picture - and this page is where that is
 * acceptable, because the page, the bundle and the WASM are all ours
 * and the uploaded file is data handed to them. Drawings and markup
 * still run with scripting off in the app's frame, and the sandbox on
 * the iframe below is not a formality.
 */

export const metadata: Metadata = {
  title: "Cosmetic",
  /* Nothing here is for a person browsing, and a search result pointing
     at a bare ornament helps nobody. */
  robots: { index: false, follow: false },
};

/**
 * Which paths may be drawn.
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

/** How to draw it: what was asked for, or what the file looks like. */
export function artKind(
  kind: string | undefined,
  src: string,
): "rive" | "svg" | "html" {
  if (kind === "rive" || kind === "svg" || kind === "html") return kind;
  if (src.endsWith(".riv")) return "rive";
  if (src.endsWith(".html")) return "html";
  return "svg";
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
  const kind = src ? artKind(one(params.kind), src) : null;
  const artboard = one(params.artboard) ?? null;
  const stateMachine = one(params.machine) ?? null;
  const cover = one(params.fit) === "cover";

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
        .cf-art { position: fixed; inset: 0; width: 100%; height: 100%;
                  border: 0; background: transparent; display: block;
                  pointer-events: none; object-fit: ${cover ? "cover" : "contain"}; }
      `}</style>

      {/* A missing or disallowed src draws nothing, the same failure an
          unloadable file already has: whatever this was decorating is
          still there and still readable. */}
      {src && kind === "svg" ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img src={src} alt="" aria-hidden="true" className="cf-art" />
      ) : null}

      {src && kind === "html" ? (
        <iframe
          src={src}
          title=""
          aria-hidden="true"
          tabIndex={-1}
          /* No allow-scripts, on purpose: this is the containment, not
             a formality. The app's frame has scripting off for this
             kind too, so uploaded markup is boxed twice. */
          sandbox=""
          scrolling="no"
          className="cf-art"
        />
      ) : null}

      {src && kind === "rive" ? (
        <div className="cf-art">
          <RiveArt
            url={src}
            artboard={artboard}
            stateMachine={stateMachine}
            fit={cover ? "cover" : "contain"}
          />
        </div>
      ) : null}
    </>
  );
}
