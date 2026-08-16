import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";

import { sanitizeSvg } from "../src/lib/admin/svg-file";
import { tsxToArt } from "../src/lib/admin/tsx-to-art";

/**
 * Turns the cosmetic art sources in src/cosmetics into the SVG files
 * that ship in public/cosmetics.
 *
 * These are the cosmetics whose art lives in the repo rather than in
 * storage - the ones we seed by migration, which cannot carry a file
 * upload with them. Everything the founder drops in through the console
 * goes to storage instead and never touches this script.
 *
 * Run: npm run cosmetics:svg
 * A unit test regenerates these and fails if the committed output has
 * drifted from its source.
 */

const SOURCES = join(process.cwd(), "src/cosmetics");
const OUT = join(process.cwd(), "public/cosmetics");

export function buildCosmeticSvg(source: string): string {
  const result = tsxToArt(source, renderToStaticMarkup);
  if (!result.ok) throw new Error(`Could not convert the art: ${result.reason}`);
  if (result.kind !== "svg") {
    /* Art that ships in the repo is seeded by a migration, and a
       migration can only carry text that the site serves as a file.
       HTML art is welcome through the console, not through here. */
    throw new Error("Art in src/cosmetics has to draw a single <svg>.");
  }

  const clean = sanitizeSvg(result.markup);
  if (!clean.ok) throw new Error(`The art did not survive sanitising: ${clean.reason}`);

  return clean.svg;
}

function main(): void {
  mkdirSync(OUT, { recursive: true });

  const files = readdirSync(SOURCES).filter((name) => name.endsWith(".tsx"));
  for (const file of files) {
    const svg = buildCosmeticSvg(readFileSync(join(SOURCES, file), "utf8"));
    const target = join(OUT, `${basename(file, ".tsx")}.svg`);
    writeFileSync(target, svg);
    console.log(`${file} -> ${target} (${svg.length} bytes)`);
  }
}

main();
