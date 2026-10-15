import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * The composer's printing and hunt choices. The founder (2026-10-15):
 * "it feels weird to scroll left when everywhere else on the app you
 * scroll down to change printing ... the 'add to a hunt' thing at
 * bottom is very weirdly placed." Then: "build your suggestions".
 */

const root = path.resolve(__dirname, "../..");
const read = (file: string) => readFileSync(path.join(root, file), "utf8");
const app = read("mobile/src/screens/flare-composer.tsx");
const web = read("src/components/flares/flare-composer.tsx");

describe("the printing", () => {
  it("is a row that opens a list down, with each printing's art", () => {
    expect(app).toContain('label="Printing"');
    expect(app).toContain("<PrintingSheet");
    expect(web).toContain('label="Printing"');
    expect(web).toContain("<PrintingSheet");
    const appSheets = read("mobile/src/composer-sheets.tsx");
    expect(appSheets).toContain('label="Any printing"');
    expect(appSheets).toMatch(/art=\{\s*<CardImage imageUrl=\{printing\.imageUrl\}/);
    const webSheets = read("src/components/flares/composer-sheets.tsx");
    expect(webSheets).toContain('label="Any printing"');
    expect(webSheets).toContain("printing.imageUrl &&");
  });

  it("no longer scrolls sideways or drops down", () => {
    const editor = app.slice(app.indexOf("function CardEditor("));
    expect(editor.slice(0, editor.indexOf("Copies needed"))).not.toContain(
      "horizontal",
    );
    expect(web).not.toContain('<option value="">Any printing</option>');
  });
});

describe("the hunt", () => {
  it("sits under Looking for / Offering, not at the foot of the form", () => {
    for (const source of [app, web]) {
      const intent = source.indexOf("Looking for");
      const hunt = source.indexOf('label="Hunt"');
      const cards = source.indexOf("Cards in this flare");
      expect(hunt).toBeGreaterThan(intent);
      expect(hunt).toBeLessThan(cards);
    }
    expect(app).not.toContain("function HuntPicker(");
    expect(web).not.toContain('<option value="__new">New hunt</option>');
  });

  it("opens a sheet: no hunt, theirs, or a new one named there", () => {
    for (const file of [
      "mobile/src/composer-sheets.tsx",
      "src/components/flares/composer-sheets.tsx",
    ]) {
      const sheets = read(file);
      expect(sheets, file).toContain('label="No hunt"');
      expect(sheets, file).toContain('label="Start a new hunt"');
      expect(sheets, file).toContain("Start this hunt");
    }
  });
});

describe("a card's own choices", () => {
  /* The founder: "if you click on the card itself, it like fades into
     an overlay and blurs the background behind it ... in there is where
     you'll change quantity, printing, etc." */
  it("open in an overlay over the blurred page, not inline in the form", () => {
    expect(app).toMatch(
      /<CardOverlay onClose=\{\(\) => setEditing\(null\)\}>\s*<CardEditor/,
    );
    expect(app).toContain("<SheetBackdrop />");
    expect(web).toMatch(/<Sheet\s+open=\{editingCard !== null\}/);
    for (const source of [app, web]) expect(source).toMatch(/Done/);
  });
});

describe("looking for or offering", () => {
  /* Kept as a choice - matching, hunts and Wanted near you run on it -
     but one quiet line, Looking for by default. */
  it("is one line with a switch, not two big buttons", () => {
    for (const source of [app, web]) {
      expect(source).toContain('"Switch to offering"');
      expect(source).toContain('"Switch to looking for"');
    }
    expect(app).not.toContain('{ key: "showcase", label: "Offering" }');
    expect(web).not.toContain('aria-label="What this flare is"');
  });
});
