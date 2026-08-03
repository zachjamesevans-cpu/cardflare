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

/**
 * The sheet's printed width against the paper it goes on.
 *
 * These two numbers live in different files — the page margin in the CSS, the
 * card width in the component — and nothing connects them. Widen the card or
 * grow the margin and the sheet silently spills onto a second page, which is
 * a failure nobody notices until a store has already printed it. Both are
 * declared in millimetres, so the check is arithmetic.
 *
 * The sheet's *height* is content-driven and cannot be computed from source;
 * it is verified by rendering at each paper size.
 */
describe("the sheet fits the paper", () => {
  const poster = readFileSync("src/components/events/join-poster.tsx", "utf8");

  /** Paper widths in millimetres. */
  const PAPER = { A4: 210, Letter: 215.9 };

  function pageMarginMm(): number {
    const match = printBlock.match(/@page\s*\{[^}]*margin:\s*([\d.]+)mm/);
    if (!match) throw new Error("no millimetre @page margin found");
    return Number(match[1]);
  }

  function sheetWidthMm(): number {
    const match = poster.match(/print:max-w-\[([\d.]+)mm\]/);
    if (!match) throw new Error("no printed max-width found on the sheet");
    return Number(match[1]);
  }

  it("declares both numbers in millimetres, so they can be compared", () => {
    expect(pageMarginMm()).toBeGreaterThan(0);
    expect(sheetWidthMm()).toBeGreaterThan(0);
  });

  it.each(Object.entries(PAPER))("fits across %s", (_paper, width) => {
    const printable = width - pageMarginMm() * 2;

    expect(sheetWidthMm()).toBeLessThanOrEqual(printable);
  });

  /*
   * A4 is the narrower of the two once margins are off, so it is the one that
   * decides. Stated separately because it is the constraint a future edit will
   * forget — Letter is wider and would happily accept a sheet A4 cannot.
   */
  it("is limited by A4 rather than by Letter", () => {
    const a4 = PAPER.A4 - pageMarginMm() * 2;
    const letter = PAPER.Letter - pageMarginMm() * 2;

    expect(a4).toBeLessThan(letter);
    expect(sheetWidthMm()).toBeLessThanOrEqual(a4);
  });
});

/**
 * What the sheet has to keep saying.
 *
 * The card layout is a presentation change, and presentation changes are
 * exactly where a load-bearing detail gets dropped by accident.
 */
describe("the printed sheet's contents", () => {
  /**
   * The markup with comments removed.
   *
   * Asserting against the raw file is worthless here, and provably so: this
   * component's doc comment explains `data-print-sheet` at length, so a test
   * for that string passed happily with the real attribute renamed away.
   * Every check below runs on what actually renders.
   */
  function markup(): string {
    return readFileSync("src/components/events/join-poster.tsx", "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");
  }

  /*
   * A QR needs clear white around it or a reader gives up, and the art window
   * puts a black border a few millimetres away. The generator only emits one
   * module of margin, so the padding here is the rest of the quiet zone.
   */
  it("pads the QR, because that padding is its quiet zone", () => {
    const artWindow = markup().match(/border-2 border-black bg-white p-\[(\d+)mm\]/);

    expect(artWindow).not.toBeNull();
    expect(Number(artWindow![1])).toBeGreaterThanOrEqual(5);
  });

  /* The print rules key off this attribute; without it the whole console prints. */
  it("still carries the attribute the print rules look for", () => {
    expect(markup()).toMatch(/^\s*data-print-sheet\s*$/m);
  });

  /*
   * Plenty of people will not scan — an old phone, a locked-down camera, a
   * cracked screen — so the typed code is a first-class route in, not a
   * footnote, and it is easy to lose while rearranging a layout.
   *
   * Twice on purpose: once at size in the rules box, and once small on the
   * collector line. Dropping either should be a decision, not an accident.
   */
  it("prints the typed code as well as the QR", () => {
    const occurrences = markup().match(/\{joinCode\}/g) ?? [];

    expect(occurrences.length).toBeGreaterThanOrEqual(2);
  });

  it("says where to type it", () => {
    expect(markup()).toMatch(/\/join/);
  });
});
