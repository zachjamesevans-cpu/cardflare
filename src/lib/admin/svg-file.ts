/**
 * What counts as safe SVG, decided without a database or a browser.
 *
 * SVG is a document format with a scripting model attached, so an
 * uploaded one is untrusted markup until proven otherwise. Cosmetics
 * are served to every player, which makes this the highest-stakes
 * upload in the product: a `<script>` that survived would run on
 * somebody else's profile.
 *
 * Two defences, deliberately both:
 *   1. This scrubber, at the door - script elements, event handlers,
 *      foreign objects and anything that reaches off our origin.
 *   2. The renderer, which draws SVG cosmetics through an `<img>`.
 *      Browsers refuse to run scripts in an image no matter what the
 *      file says, so even a hole here is not a hole in the page.
 *
 * Free of server-only imports so every rule is unit-testable.
 */

/** A drawing this big is a mistake, not a cosmetic. */
export const SVG_MAX_BYTES = 2_000_000;

export type SvgRejection = "empty" | "too-big" | "not-svg" | "nothing-left";

export const SVG_REJECTION_COPY: Record<SvgRejection, string> = {
  empty: "That file was empty.",
  "too-big": "That drawing is over 2 MB. Simplify it and export again.",
  "not-svg": "That is not an SVG. Export as SVG, or drop the Figma .tsx in instead.",
  "nothing-left": "Everything in that file was stripped as unsafe. Nothing to draw.",
};

/** Attributes that run code. Matched case-insensitively, with or without a value. */
export const EVENT_ATTRIBUTE = /\son[a-z-]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi;

/** Elements that either script or reach outside the drawing. */
const BANNED_ELEMENTS = [
  "script",
  "foreignObject",
  "iframe",
  "object",
  "embed",
  "audio",
  "video",
  "animateScript",
  "handler",
  "set",
];

/**
 * References that leave our origin, or smuggle code in a URL.
 *
 * Local references (`href="#glow-xl"`) are the whole point of SVG defs
 * and are kept. Everything else - http, data:, javascript: - goes.
 */
const EXTERNAL_REF =
  /\s(?:xlink:href|href|src)\s*=\s*(?:"(?!#)[^"]*"|'(?!#)[^']*'|(?!["'#])[^\s>]+)/gi;

export type SvgResult = { ok: true; svg: string } | { ok: false; reason: SvgRejection };

/**
 * Strips everything dangerous and hands back what is left.
 *
 * Deliberately a scrubber rather than a validator: a Figma export is
 * full of harmless oddities, and refusing whole files over one stray
 * attribute would make this door useless. What must never survive is
 * anything that executes or fetches.
 */
export function sanitizeSvg(markup: string): SvgResult {
  if (!markup.trim()) return { ok: false, reason: "empty" };
  if (new TextEncoder().encode(markup).length > SVG_MAX_BYTES) {
    return { ok: false, reason: "too-big" };
  }

  const open = markup.indexOf("<svg");
  const close = markup.lastIndexOf("</svg>");
  if (open === -1 || close === -1) return { ok: false, reason: "not-svg" };

  let svg = markup.slice(open, close + "</svg>".length);

  /* Banned elements, with their contents. */
  for (const element of BANNED_ELEMENTS) {
    svg = svg.replace(
      new RegExp(`<${element}\\b[\\s\\S]*?<\\/${element}\\s*>`, "gi"),
      "",
    );
    /* And the self-closing form. */
    svg = svg.replace(new RegExp(`<${element}\\b[^>]*\\/?>`, "gi"), "");
  }

  svg = svg.replace(EVENT_ATTRIBUTE, "");
  svg = svg.replace(EXTERNAL_REF, "");

  /* A URL that survived inside a style or attribute value. */
  svg = svg.replace(/javascript:/gi, "");

  if (!svg.includes("<svg")) return { ok: false, reason: "nothing-left" };

  /* Standalone files need their namespace. */
  if (!/\sxmlns=/.test(svg.slice(0, svg.indexOf(">") + 1))) {
    svg = svg.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"');
  }

  return { ok: true, svg };
}
