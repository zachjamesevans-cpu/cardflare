import { transform } from "sucrase";
import * as React from "react";
import { createElement, type ReactElement } from "react";

/**
 * A Figma export, turned into a cosmetic.
 *
 * The founder works in Figma Make and gets back a `src/*.tsx` file: a
 * React component that draws the thing. Sometimes it draws an `<svg>`.
 * Just as often it draws divs with conic gradients, blurs and
 * `@keyframes` - which is a perfectly good animated cosmetic and used
 * to be rejected out of hand ("That component drew no SVG"). His ask:
 * "please make it so I can just drop in the .tsx files."
 *
 * So this unwraps the packaging and keeps whatever was drawn, in
 * whichever of the two shapes it came out as:
 *
 *   svg  - the component drew one `<svg>` and nothing else around it.
 *          Cheapest to draw: the web renders it in an `<img>`.
 *   html - anything else. Markup plus the CSS that animates it, drawn
 *          in a sandbox with scripting switched off.
 *
 * Rendering is injected rather than imported so the same function runs
 * in the console (in the founder's own browser) and in the test (in
 * Node). Neither runs uploaded code on our server, which is the whole
 * point: a Server Action holds the service-role key, and nothing that
 * arrives in a file upload should ever share a process with it.
 *
 * Free of server-only imports so the whole pipeline is unit-testable -
 * and it is tested against the founder's actual exports.
 */

export type RenderToHtml = (element: ReactElement) => string;

export type TsxRejection = "empty" | "no-default-export" | "threw" | "nothing-drawn";

export const TSX_REJECTION_COPY: Record<TsxRejection, string> = {
  empty: "That file was empty.",
  "no-default-export":
    "That file has no default export. Figma exports one; keep the `export default function App()` line.",
  threw: "That component threw while drawing. Check it renders in Figma first.",
  "nothing-drawn": "That component rendered nothing at all. There is no art in it.",
};

/** What a component drew, and therefore how it will be stored. */
export type ArtMarkup =
  { kind: "svg"; markup: string } | { kind: "html"; markup: string };

export type TsxResult =
  ({ ok: true } & ArtMarkup) | { ok: false; reason: TsxRejection };

/**
 * Everything the module is allowed to reach.
 *
 * The real React, because a Figma export uses hooks - `useMemo` to
 * build a list of petals, `useState` for a toggle - and the first cut
 * handed out an object with only `createElement` on it, so every one of
 * those files died on its first line. Handing over React itself grants
 * nothing extra: it is the same React the page is already running, with
 * no filesystem and no network on it.
 *
 * Anything else is refused. A file reaching for a chart library or
 * `node:fs` is a file we do not understand well enough to run.
 */
function requireShim(name: string): unknown {
  if (name === "react" || name === "react/jsx-runtime") {
    return { ...React, default: React };
  }
  throw new Error(`This file imports ${name}, which cosmetics cannot use.`);
}

export function tsxToArt(source: string, render: RenderToHtml): TsxResult {
  if (!source.trim()) return { ok: false, reason: "empty" };

  let component: unknown;

  try {
    const { code } = transform(source, {
      transforms: ["typescript", "jsx", "imports"],
      /* Classic runtime: the shim hands the module a React with
         createElement on it, which is all a drawing needs. */
      jsxRuntime: "classic",
      production: true,
    });

    /* Named `box` rather than `module`: the transformed code refers to
       the parameter, not to this variable, and Next forbids assigning
       to a variable called `module` anywhere in the bundle. */
    const box = { exports: {} as Record<string, unknown> };
    const run = new Function("require", "module", "exports", "React", code);
    run(requireShim, box, box.exports, React);

    component = box.exports.default;
  } catch {
    return { ok: false, reason: "threw" };
  }

  if (!component) return { ok: false, reason: "no-default-export" };
  if (typeof component !== "function") {
    return { ok: false, reason: "no-default-export" };
  }

  let html: string;
  try {
    html = render(createElement(component as () => ReactElement));
  } catch {
    return { ok: false, reason: "threw" };
  }

  const art = extractArt(html);
  return art ? { ok: true, ...art } : { ok: false, reason: "nothing-drawn" };
}

const STYLE_BLOCK = /<style[^>]*>([\s\S]*?)<\/style>/g;

/** Elements a Figma export uses purely to centre something. */
const LAYOUT_WRAPPER =
  /^<(div|span|section|main|figure|article)\b[^>]*>([\s\S]*)<\/\1>$/;

/**
 * The lone `<svg>` inside a stack of centring wrappers, or null.
 *
 * Figma Make centres its art in a div, so a drawing almost never
 * arrives as the outermost element. Peeling those off is safe because
 * the wrapper only ever positions the art, and the cosmetic layer
 * positions it again anyway.
 *
 * It gives up the moment it finds anything other than one drawing:
 * two sibling wrappers, an svg beside a div, text of its own. Those
 * are HTML art, and guessing at them would be how the founder's Robin
 * ring lost its rings.
 */
function unwrapToDrawing(body: string): string | null {
  let inner = body;

  for (let peel = 0; peel < 6; peel += 1) {
    if (
      inner.startsWith("<svg") &&
      inner.endsWith("</svg>") &&
      (inner.match(/<svg\b/g) ?? []).length === 1
    ) {
      return inner;
    }

    const wrapper = inner.match(LAYOUT_WRAPPER);
    if (!wrapper) return null;
    inner = wrapper[2].trim();
  }

  return null;
}

/**
 * Pulls the art out of whatever the component wrapped it in.
 *
 * Two shapes come out of Figma. A drawing is a single `<svg>` and
 * nothing else, usually with its keyframes in a `<style>` beside it -
 * those get moved inside, because a standalone file has to carry its
 * own animation or the art arrives frozen. Anything else is HTML: the
 * markup and its CSS, kept together so the frame that draws it has
 * both.
 *
 * Only the `<style>` blocks OUTSIDE the drawing are moved. An earlier
 * cut lifted every one of them out to work out what had been drawn,
 * and quietly dropped the ones a well-formed SVG already carried - the
 * test for the shipped lightning ring is what caught it.
 *
 * The one-`<svg>` test is deliberately strict about being the WHOLE
 * thing. The founder's Robin ring is HTML rings with little SVG hands
 * inside; slicing from the first `<svg` to the last `</svg>` there
 * would have thrown away the rings and kept the hands, which is worse
 * than any error message.
 */
export function extractArt(html: string): ArtMarkup | null {
  const svgOpen = html.indexOf("<svg");
  const svgClose = html.lastIndexOf("</svg>");
  const svgEnd = svgClose === -1 ? -1 : svgClose + "</svg>".length;

  const loose: { whole: string; css: string }[] = [];
  for (const match of html.matchAll(STYLE_BLOCK)) {
    if (match.index === undefined) continue;
    const insideTheDrawing =
      svgOpen !== -1 && match.index > svgOpen && match.index < svgEnd;
    if (!insideTheDrawing) loose.push({ whole: match[0], css: match[1] });
  }

  let body = html;
  for (const style of loose) body = body.replace(style.whole, "");
  body = body.trim();

  if (!body) return null;

  const drawing = unwrapToDrawing(body);

  if (drawing) {
    let svg = drawing;

    if (loose.length > 0) {
      const afterTag = svg.indexOf(">") + 1;
      const css = loose.map((style) => style.css).join("\n");
      svg = `${svg.slice(0, afterTag)}<style>${css}</style>${svg.slice(afterTag)}`;
    }

    /* A standalone file needs its namespace even when JSX left it off. */
    if (!/\sxmlns=/.test(svg.slice(0, svg.indexOf(">") + 1))) {
      svg = svg.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"');
    }

    return { kind: "svg", markup: svg };
  }

  /* HTML art: the loose styles go back in front, where the frame can
     find them, rather than wherever React happened to emit them. */
  const css = loose.map((style) => style.css).join("\n");
  const stripped = dropPageBackground(body);
  const markup = loose.length > 0 ? `<style>${css}</style>${stripped}` : stripped;

  return { kind: "html", markup };
}

/** A flat colour: a hex, an rgb/hsl call, or a bare colour word. */
const FLAT_COLOUR = /^(#[0-9a-f]{3,8}|(?:rgba?|hsla?)\([^)]*\)|[a-z]+)$/i;

/**
 * Takes the page background off the outermost element.
 *
 * Figma Make builds a demo PAGE, not an asset: the founder's Robin ring
 * arrives inside a full-screen div painted `#07050f`, which as a
 * cosmetic is an opaque black square sitting on top of somebody's
 * profile. The page background had to be deleted by hand from the
 * lightning ring too, so it is worth doing here rather than asking
 * again.
 *
 * Only a FLAT colour, and only on the outermost element. A gradient is
 * how half these cosmetics are drawn - the Robin rings are spinning
 * conic gradients - and stripping one would delete the art instead of
 * the backdrop. A flat opaque fill behind everything is never the
 * cosmetic.
 */
function dropPageBackground(body: string): string {
  const tagEnd = body.indexOf(">");
  if (!body.startsWith("<") || tagEnd === -1) return body;

  const openTag = body.slice(0, tagEnd + 1);
  const style = openTag.match(/\sstyle="([^"]*)"/i);
  if (!style) return body;

  const kept = style[1]
    .split(";")
    .filter((declaration) => {
      const [property, ...rest] = declaration.split(":");
      const name = property.trim().toLowerCase();
      if (name !== "background" && name !== "background-color") return true;
      return !FLAT_COLOUR.test(rest.join(":").trim());
    })
    .join(";");

  if (kept === style[1]) return body;

  const tidied = openTag.replace(style[0], kept.trim() ? ` style="${kept}"` : "");
  return tidied + body.slice(tagEnd + 1);
}
