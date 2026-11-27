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
  /* The founder (2026-11-25): "just the swipe is needed on this screen".
     Each art is its own card, so the editor has nothing to pick: no
     Printing row, no art pictures. */
  it("is not chosen in the editor at all, on either platform", () => {
    for (const source of [app, web]) {
      expect(source).not.toContain('label="Printing"');
      expect(source).not.toContain("<ArtChoice");
      expect(source).not.toContain("<PrintingSheet");
    }
  });

  it("no longer scrolls sideways or drops down", () => {
    const editor = app.slice(app.indexOf("function CardEditor("));
    expect(editor.slice(0, editor.indexOf("<Stepper"))).not.toContain("horizontal");
    const webEditor = web.slice(web.indexOf("function CardEditor("));
    expect(webEditor.slice(0, webEditor.indexOf("<Stepper"))).not.toContain(
      "overflow-x-auto",
    );
    expect(web).not.toContain('<option value="">Any printing</option>');
  });
});

describe("the hunt", () => {
  /* The founder (2026-10-15): "okay, im posting a flare, but also adding
     to a hunt? ... if they want to add to their hunt, they go to their
     hunts screen ... i think it's a bit convoluted when you're posting a
     flare." No picker: a hunt's own "+" opens the composer into it. */
  it("has no picker in the composer, on either platform", () => {
    for (const source of [app, web]) {
      expect(source).not.toContain('label="Hunt"');
      expect(source).not.toContain("HuntSheet");
      expect(source).not.toContain("huntRowValue");
    }
    for (const file of [
      "mobile/src/composer-sheets.tsx",
      "src/components/flares/composer-sheets.tsx",
    ]) {
      const sheets = read(file);
      expect(sheets, file).not.toContain("Start a new hunt");
      expect(sheets, file).toContain("export function AddingToHunt(");
      expect(sheets, file).toContain("Post without the hunt");
    }
  });

  it("says Adding to, only when opened from a hunt", () => {
    expect(app).toMatch(/draft\.hunt\?\.kind === "existing" \? \(\s*<AddingToHunt/);
    expect(web).toMatch(/draft\.hunt\.kind === "existing" && \(\s*<AddingToHunt/);
  });

  it("never restores a hunt from a saved draft", () => {
    expect(app).toContain("hunt: current.hunt,");
    expect(app).not.toContain("current.hunt ?? saved.hunt");
    expect(read("src/components/flares/draft.ts")).toMatch(
      /Never restored[\s\S]{0,240}hunt: \{ kind: "none" \},/,
    );
  });

  it("opens into the same hunt again on a second +", () => {
    const hub = read("mobile/src/screens/hub.tsx");
    expect(hub).toContain("n: (last?.n ?? 0) + 1");
    expect(hub).toContain("huntSignal={openInto?.n}");
    expect(app).toContain("}, [initialHuntId, huntSignal]);");
  });
});

describe("a card's own choices", () => {
  /* The founder: "if you click on the card itself, it like fades into
     an overlay and blurs the background behind it ... in there is where
     you'll change quantity, printing, etc." */
  it("open in an overlay over the blurred page, not inline in the form", () => {
    expect(app).toMatch(/<CardOverlay onClose=\{\(\) => setEditing\(null\)\}>/);
    /* On the blur with no box, the card view's look (2026-11-27). */
    expect(app).toContain("<FloatBackdrop />");
    expect(app).toContain("<FloatClose onPress={onClose} />");
    expect(web).toMatch(/<Sheet\s+float\s+open=\{editingCard !== null\}/);
    for (const source of [app, web]) expect(source).toMatch(/Done/);
  });

  /* "you should be able to swipe between the cards so you don't have to
     tap out to go to next card" - the cards in this flare. */
  it("pages along the cards in this flare without closing", () => {
    expect(app).toContain("<CardPager");
    expect(app).toContain("pagingEnabled");
    expect(web).toContain("<CardSteps");
    expect(web).toContain('event.key === "ArrowRight"');
  });
});

describe("no offering in the composer", () => {
  /* The founder (2026-10-15): "delete the offering thing altogether. i
     truly think just having a binder is more than enough for trades.
     and delete the 'looking for' text." Every post is a want. */
  it("has no Looking for / Offering choice or line", () => {
    for (const source of [app, web]) {
      expect(source).not.toContain("Switch to offering");
      expect(source).not.toContain("Switch to looking for");
    }
    expect(app).not.toContain("function IntentControl(");
  });

  it("treats a draft saved as an offer as a want", () => {
    expect(app).toMatch(/Always a want now[\s\S]{0,80}intent: "want",/);
    expect(read("src/components/flares/draft.ts")).toMatch(
      /Always a want now[\s\S]{0,80}intent: "want",/,
    );
  });
});

describe("the card editor, kept quiet", () => {
  it("has no Make cover or Remove; the row orders and removes", () => {
    for (const source of [app, web]) {
      const editor = source.slice(source.indexOf("function CardEditor("));
      const body = editor.slice(0, editor.indexOf("\n}\n"));
      expect(body).not.toContain("Make cover");
      expect(body).not.toMatch(/>\s*Remove\s*</);
      /* "remove the add a note button it's so awkward." */
      expect(body).not.toContain("Add a note");
      expect(body).not.toContain("<CardNoteField");
    }
    /* The app's row: drop a card on the bin. The website's: the same,
       and Delete on a focused card. */
    expect(read("mobile/src/card-tray.tsx")).toContain("Drop a card here to remove it");
    expect(web).toContain("remove(dragging)");
    expect(web).toContain('event.key === "Delete"');
  });
});
