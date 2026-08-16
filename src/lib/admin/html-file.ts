import { EVENT_ATTRIBUTE, SVG_MAX_BYTES } from "./svg-file";

/**
 * What counts as safe HTML art, decided without a database or a browser.
 *
 * Plenty of Figma exports are not drawings at all: they are divs with
 * conic gradients, blur filters and `@keyframes`, which animate
 * beautifully and are not an `<svg>` in any sense. Refusing them was
 * the wrong call - "please make it so I can just drop in the .tsx
 * files" - so they are stored as markup and drawn in a sandbox.
 *
 * Three defences, deliberately all three:
 *   1. This scrubber, at the door - scripts, event handlers, embedded
 *      documents, and anything that reaches off our origin.
 *   2. The renderer, which draws HTML art in an iframe WITHOUT
 *      `allow-scripts`. No JavaScript can run in it at all, whatever
 *      survived here, and it has no access to the page around it.
 *   3. A `default-src 'none'` policy inside that frame, so nothing it
 *      contains can fetch anything either.
 *
 * The first is the weakest of the three and is treated that way: the
 * containment is the sandbox, and this is the tidying.
 *
 * Free of server-only imports so every rule is unit-testable.
 */

export const HTML_MAX_BYTES = SVG_MAX_BYTES;

export type HtmlRejection = "empty" | "too-big" | "nothing-left";

export const HTML_REJECTION_COPY: Record<HtmlRejection, string> = {
  empty: "That file drew nothing.",
  "too-big": "That art is over 2 MB. Simplify it and export again.",
  "nothing-left": "Everything in that file was stripped as unsafe. Nothing to draw.",
};

/**
 * Elements that script, embed another document, take input, or pull
 * something in from outside. Art needs none of them.
 */
const BANNED_ELEMENTS = [
  "script",
  "iframe",
  "object",
  "embed",
  "link",
  "meta",
  "base",
  "form",
  "input",
  "button",
  "textarea",
  "select",
  "audio",
  "video",
  "noscript",
];

/** Any src or href that is not a local fragment or an inline data image. */
const EXTERNAL_REF =
  /\s(?:xlink:href|href|src|srcset|poster|data)\s*=\s*(?:"(?!#|data:image\/)[^"]*"|'(?!#|data:image\/)[^']*'|(?!["'#])[^\s>]+)/gi;

/** A stylesheet pulling in another stylesheet, or a font, or a picture. */
const CSS_IMPORT = /@import[^;]*;?/gi;
const CSS_EXTERNAL_URL = /url\(\s*(?!['"]?(?:#|data:image\/))[^)]*\)/gi;

export type HtmlResult =
  { ok: true; html: string } | { ok: false; reason: HtmlRejection };

/**
 * Strips everything that executes or fetches and hands back the rest.
 *
 * A scrubber rather than a validator, the same call as the SVG door: a
 * Figma export is full of harmless oddities, and refusing a whole file
 * over one stray attribute would make this door useless.
 */
export function sanitizeHtml(markup: string): HtmlResult {
  if (!markup.trim()) return { ok: false, reason: "empty" };
  if (new TextEncoder().encode(markup).length > HTML_MAX_BYTES) {
    return { ok: false, reason: "too-big" };
  }

  let html = markup;

  for (const element of BANNED_ELEMENTS) {
    html = html.replace(
      new RegExp(`<${element}\\b[\\s\\S]*?<\\/${element}\\s*>`, "gi"),
      "",
    );
    html = html.replace(new RegExp(`<${element}\\b[^>]*\\/?>`, "gi"), "");
  }

  html = html.replace(EVENT_ATTRIBUTE, "");
  html = html.replace(EXTERNAL_REF, "");
  html = html.replace(CSS_IMPORT, "");
  html = html.replace(CSS_EXTERNAL_URL, "none");
  html = html.replace(/javascript:/gi, "");

  if (!html.trim() || !/<[a-z]/i.test(html)) {
    return { ok: false, reason: "nothing-left" };
  }

  return { ok: true, html };
}

/**
 * The document HTML art is drawn inside, on both platforms.
 *
 * An iframe with `sandbox` and no `allow-scripts` on the web, a WebView
 * with JavaScript switched off on the phone. Both get this same
 * document, so the art cannot look different in the two places: one
 * string, built here, used by the renderer on each.
 *
 * The policy line is the third lock. Even markup that got past the
 * scrubber cannot load a font, a tracking pixel or a stylesheet from
 * anywhere, because nothing but inline styles and data-URI images is
 * allowed to load at all.
 */
export function artDocument(html: string): string {
  return [
    "<!doctype html><html><head><meta charset='utf-8'>",
    "<meta http-equiv='Content-Security-Policy' ",
    "content=\"default-src 'none'; style-src 'unsafe-inline'; img-src data:\">",
    "<style>",
    "html,body{margin:0;padding:0;width:100%;height:100%;",
    "background:transparent;overflow:hidden}",
    /* Art is authored in a 400 by 400 box; the frame is square, so the
       art scales with it however big the avatar happens to be. */
    "body>*{width:100%;height:100%}",
    "</style></head><body>",
    html,
    "</body></html>",
  ].join("");
}
