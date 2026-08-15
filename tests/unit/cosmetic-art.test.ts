import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Art and catalogue, welded together.
 *
 * The founder's brief: "did you actually design the 210 cosmetics? I
 * don't see a preview for any of them." Never again - every draft slug
 * in the migrations must own a `.cfa-` rule in cosmetic-art.css, and
 * every `.cfa-` rule must belong to a slug, so neither a cosmetic
 * without art nor art for a deleted cosmetic can ship.
 */

const css = readFileSync(join(process.cwd(), "src/app/cosmetic-art.css"), "utf8");

const migrationsDir = join(process.cwd(), "supabase/migrations");
const sql = readdirSync(migrationsDir)
  .map((file) => readFileSync(join(migrationsDir, file), "utf8"))
  .join("\n");

const CATALOG_KINDS = [
  "ring",
  "border",
  "pattern",
  "animation",
  "background",
  "scene",
  "nameplate",
  "title",
  "badge",
];

const slugs = new Set(
  [...sql.matchAll(/\('([a-z0-9-]+)',\s*'([a-z]+)'/g)]
    .filter(([, , kind]) => CATALOG_KINDS.includes(kind))
    .map(([, slug]) => slug),
);

const artClasses = new Set([...css.matchAll(/\.cfa-([a-z0-9-]+)/g)].map((m) => m[1]));

describe("cosmetic art coverage", () => {
  it("every catalogue cosmetic has art", () => {
    const missing = [...slugs].filter((slug) => !artClasses.has(slug)).sort();
    expect(
      missing,
      `These cosmetics have no .cfa- rule in cosmetic-art.css:\n${missing.join("\n")}`,
    ).toEqual([]);
  });

  it("every art class belongs to a cosmetic that exists", () => {
    const orphans = [...artClasses].filter((cls) => !slugs.has(cls)).sort();
    expect(
      orphans,
      `These .cfa- rules have no cosmetic behind them:\n${orphans.join("\n")}`,
    ).toEqual([]);
  });

  it("covers the whole catalogue, so the scan cannot pass by finding nothing", () => {
    expect(slugs.size).toBeGreaterThanOrEqual(210);
    expect(artClasses.size).toBe(slugs.size);
  });

  it("the art file is imported, so the classes actually reach the page", () => {
    const globals = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
    expect(globals).toContain('@import "./cosmetic-art.css"');
  });

  it("scaffolds stay out of the per-slug namespace", () => {
    /* .cfx- is the scaffold prefix; a scaffold accidentally named .cfa-
       would trip the orphan check above, and a slug rule written as
       .cfx- would trip the missing check. This pins the convention. */
    expect(css).toMatch(/\.cfx-ring\b/);
    expect(css).toMatch(/\.cfx-card\b/);
    expect(css).toMatch(/\.cfx-panel\b/);
  });
});
