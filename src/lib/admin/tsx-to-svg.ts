import { transform } from "sucrase";
import { createElement, type ReactElement } from "react";

/**
 * A Figma-style .tsx export, turned into a standalone SVG.
 *
 * The founder works in Figma and gets back a `src/*.tsx` file: a React
 * component that draws an SVG, with its keyframes in a `<style>` tag
 * beside it. That is a cosmetic in every way except its packaging, so
 * this unwraps it - transform the TypeScript and JSX, run the module,
 * render it once, and keep the SVG it drew.
 *
 * Rendering is injected rather than imported, because the two callers
 * live in different worlds: the console does it in the founder's own
 * browser (React is already there, and code from a file he exported
 * himself runs where he ran the exporter), and the test does it in Node
 * with renderToStaticMarkup. Neither runs uploaded code on our server,
 * which is the whole point: a Server Action holds the service-role key,
 * and nothing that arrives in a file upload should ever share a process
 * with it.
 *
 * Free of server-only imports so the whole pipeline is unit-testable -
 * and it is tested against the founder's actual lightning file.
 */

export type RenderToHtml = (element: ReactElement) => string;

export type TsxRejection =
  "empty" | "no-default-export" | "threw" | "no-svg" | "not-a-component";

export const TSX_REJECTION_COPY: Record<TsxRejection, string> = {
  empty: "That file was empty.",
  "no-default-export":
    "That file has no default export. Figma exports one; keep the `export default function App()` line.",
  threw: "That component threw while drawing. Check it renders in Figma first.",
  "no-svg":
    "That component drew no SVG. A cosmetic has to be an <svg>, not a div of HTML.",
  "not-a-component": "That default export is not a component.",
};

export type TsxResult = { ok: true; svg: string } | { ok: false; reason: TsxRejection };

/**
 * Everything the module is allowed to reach.
 *
 * A tiny require shim rather than a real module loader: a Figma export
 * imports React and nothing else, and a file reaching for anything else
 * is a file we do not understand well enough to run.
 */
function requireShim(name: string): unknown {
  if (name === "react" || name === "react/jsx-runtime") {
    return { createElement, default: { createElement } };
  }
  throw new Error(`This file imports ${name}, which cosmetics cannot use.`);
}

export function tsxToSvg(source: string, render: RenderToHtml): TsxResult {
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
    run(requireShim, box, box.exports, { createElement });

    component = box.exports.default;
  } catch {
    return { ok: false, reason: "threw" };
  }

  if (!component) return { ok: false, reason: "no-default-export" };
  if (typeof component !== "function") {
    return { ok: false, reason: "not-a-component" };
  }

  let html: string;
  try {
    html = render(createElement(component as () => ReactElement));
  } catch {
    return { ok: false, reason: "threw" };
  }

  const svg = extractSvg(html);
  return svg ? { ok: true, svg } : { ok: false, reason: "no-svg" };
}

/**
 * Pulls the drawing out of whatever the component wrapped it in.
 *
 * Figma exports centre the art in a div and put the keyframes in a
 * `<style>` beside it. Both matter and only one is inside the SVG, so
 * the styles are moved in: a standalone file has to carry its own
 * animation, or the art arrives frozen.
 */
export function extractSvg(html: string): string | null {
  const open = html.indexOf("<svg");
  const close = html.lastIndexOf("</svg>");
  if (open === -1 || close === -1) return null;

  let svg = html.slice(open, close + "</svg>".length);

  /* Styles that sat outside the SVG, gathered in document order. */
  const styles: string[] = [];
  for (const match of html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)) {
    if (match.index !== undefined && (match.index < open || match.index > close)) {
      styles.push(match[1]);
    }
  }

  if (styles.length > 0) {
    const afterTag = svg.indexOf(">") + 1;
    svg = `${svg.slice(0, afterTag)}<style>${styles.join("\n")}</style>${svg.slice(afterTag)}`;
  }

  /* A standalone file needs its namespace even when JSX left it off. */
  if (!/\sxmlns=/.test(svg.slice(0, svg.indexOf(">") + 1))) {
    svg = svg.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"');
  }

  return svg;
}
