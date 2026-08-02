import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * The print rules are CSS, so there is no component to render and assert on.
 * What can be checked is that the rules say what they need to say — and every
 * one of these has a specific way of being broken by a well-meaning edit.
 */
const css = readFileSync("src/app/globals.css", "utf8");

/** The `@media print` block alone, brace-matched so it stops where it ends. */
function mediaPrintBlock(source: string): string {
  const start = source.indexOf("@media print");
  if (start === -1) throw new Error("no @media print block in globals.css");

  let depth = 0;

  for (let i = source.indexOf("{", start); i < source.length; i += 1) {
    if (source[i] === "{") depth += 1;
    else if (source[i] === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }

  throw new Error("unbalanced braces in the @media print block");
}

const printBlock = mediaPrintBlock(css);

describe("printing a join poster", () => {
  it("sets a page margin, so the sheet is not printed edge to edge", () => {
    expect(printBlock).toMatch(/@page\s*\{[^}]*margin:/);
  });

  /*
   * `visibility: hidden` was the first attempt and printed a blank second
   * page: hidden elements keep their space, so the document stayed as tall as
   * the console. Only `display: none` collapses it.
   */
  it("collapses the console rather than merely hiding it", () => {
    expect(printBlock).toMatch(/display:\s*none/);
    expect(printBlock).not.toMatch(/visibility:\s*hidden/);
  });

  it("spares the sheet, its contents, and the ancestors carrying it", () => {
    expect(printBlock).toContain(":not(:has([data-print-sheet]))");
    expect(printBlock).toContain(":not([data-print-sheet])");
    expect(printBlock).toContain("[data-print-sheet] *");
  });

  /*
   * The shell pins html to h-full and body to min-h-full. On paper that makes
   * the document exactly one viewport tall, which overflows the printable area
   * once @page margins are subtracted — the other cause of the blank second
   * page.
   */
  it("releases the full-height shell so the document can be short", () => {
    expect(printBlock).toMatch(/height:\s*auto\s*!important/);
    expect(printBlock).toMatch(/min-height:\s*0\s*!important/);
  });

  /*
   * Ancestor padding and max-widths would indent the sheet and push it down
   * the page.
   */
  it("strips the spacing off the ancestors it keeps", () => {
    const ancestorRule = printBlock.slice(
      printBlock.indexOf("*:has([data-print-sheet])"),
    );

    expect(ancestorRule).toMatch(/padding:\s*0\s*!important/);
    expect(ancestorRule).toMatch(/margin:\s*0\s*!important/);
  });

  /*
   * Guarded, or every other page in the app would print blank.
   */
  it("only applies on a page that has a sheet", () => {
    const rules = printBlock.match(/^\s{2}[^@\s][^{]*\{/gm) ?? [];
    const unguarded = rules.filter(
      (rule) => !rule.includes("data-print-sheet") && !rule.includes("@page"),
    );

    expect(unguarded).toEqual([]);
  });

  /* Browsers drop backgrounds when printing unless told otherwise. */
  it("has a way to force a background onto the page", () => {
    expect(css).toContain("print-color-adjust: exact");
    expect(css).toContain("-webkit-print-color-adjust: exact");
  });
});
