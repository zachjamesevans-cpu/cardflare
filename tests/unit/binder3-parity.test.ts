import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/* A file that is not there yet reads as empty, so every pin on it
   fails by name instead of the whole suite failing to load. */
const read = (path: string) => {
  try {
    return readFileSync(resolve(import.meta.dirname, "../..", path), "utf8");
  } catch {
    return "";
  }
};

/**
 * Binder round 3, both platforms: the binder page without its buttons.
 *
 * The founder (2026-10-03): "I think having the binder edit screen be
 * all the way at the bottom is kinda meh. Maybe a small edit icon at
 * the top or something. Also the add cards button and edit button are
 * completely redundant because you should be able to do both of those
 * on that screen already. Delete."
 *
 * So, on the website and in the app alike: no Add cards button and no
 * Edit toggle under the page. A card goes in through the "+" in an
 * empty pocket, and comes out by being dropped on a Remove zone that
 * appears under the page only while a card is held. The settings
 * (name, Up for trade, cover, Delete binder) sit in a sheet behind a
 * pencil at the top. Read off the source, because parity is the same
 * words, the same controls and the same place on both platforms.
 */

const web = {
  view: read("src/components/binder/binder-page.tsx"),
  settings: read("src/components/binder/binder-settings.tsx"),
  add: read("src/components/binder/add-binder-card.tsx"),
};

const app = {
  binder: read("mobile/src/screens/binder.tsx"),
  /* The sheet may be its own file; the screen is read with it. */
  settingsSheet: read("mobile/src/binder-settings-sheet.tsx"),
};

/* The page as a whole, per platform. */
const webPage = web.view + web.settings;
const appPage = app.binder + app.settingsSheet;

const platforms = [
  ["web", webPage],
  ["app", appPage],
] as const;

/* The words, exact, on both platforms. */
const HINT = "Hold a card to move it, or drop it on Remove.";
const EMPTY = "Cards you would trade. Add the ones you carry.";

describe("the binder page without its buttons", () => {
  it("exists on both platforms", () => {
    expect(web.view.length, "web view").toBeGreaterThan(0);
    expect(web.settings.length, "web settings").toBeGreaterThan(0);
    expect(app.binder.length, "app binder").toBeGreaterThan(0);
  });

  it("says the same words on both platforms", () => {
    for (const [name, page] of platforms) {
      for (const word of [
        "Binder settings",
        "Remove from binder",
        "Remove",
        HINT,
        EMPTY,
      ]) {
        expect(page, `${name}: ${word}`).toContain(word);
      }
    }
  });

  it("has no Edit toggle and no Add cards button under the page", () => {
    for (const [name, page] of platforms) {
      expect(page, name).not.toContain("editing");
      expect(page, name).not.toContain("setEditing");
      expect(page, name).not.toContain('"Done"');
      expect(page, name).not.toMatch(/\{editing \? "Done" : "Edit"\}/);
    }
    /* The website's view never says Add cards: the sheet, with its
       title, lives in add-binder-card.tsx and is opened by the "+"
       pockets alone. Its own button is off unless asked for. */
    expect(web.view).not.toMatch(/>\s*Add cards\s*</);
    expect(web.view).not.toContain("<Button");
    expect(web.view).not.toContain('from "@/components/ui/button"');
    expect(web.add).toContain('title="Add cards"');
    expect(web.add).toContain("trigger = false");
    expect(web.add).toMatch(/\{trigger && \(\s*<Button/);
    expect(web.view).not.toContain("trigger");
    /* The app's one "Add cards" control is the pocket, not a Button. */
    expect(app.binder).not.toMatch(/<Button[^>]*label="Add cards"/);
    expect(app.binder).not.toMatch(/<Button[^>]*label=\{editing/);
  });

  it("keeps the + pockets as the way in", () => {
    /* Binder round 3: each "+" opens the sheet for its own pocket, and
       the page count comes from the shared pocket maths. */
    expect(web.view).toMatch(
      /<AddPocket\s+onClick=\{\(\) => setAdding\(\{ pocket: slot \}\)\}/,
    );
    expect(web.view).toContain("open={adding !== null}");
    expect(web.view).toContain("const pages = pagesFor(list, binder.yours);");
    expect(app.binder).toContain("onPress={() => onAdd(pocket)}");
    expect(app.binder).toContain("setAddAt(pocket);");
    expect(app.binder).toContain("visible={addAt !== null}");
    expect(app.binder).toContain(
      "const pageCount = Math.max(pagesFor(cards, yours), pagesFor(shown, yours));",
    );
  });
});

describe("removing a card is a drop", () => {
  it("draws the Remove zone under the page only while a card is held, on the web", () => {
    /* One more drop target, in the danger colour, dashed. Binder
       round 3: the pointer drag finds it by its data-drop mark. */
    expect(read("src/components/binder/pocket-drag.ts")).toContain(
      'export type DropSpot = number | "prev" | "next" | "remove";',
    );
    expect(web.view).toMatch(/\{binder\.yours && dragging && \(\s*<div/);
    expect(web.view).toContain('aria-label="Remove from binder"');
    expect(web.view).toContain('data-drop="remove"');
    expect(web.view).toMatch(/border-2 border-dashed border-danger[^"]*text-danger/);
    expect(web.view).toMatch(/>\s*Remove\s*</);
    expect(web.view).toContain('if (spot === "remove") remove(entryId);');
    expect(web.view).toContain("removeBinderCardAction(card.entryId, binder.id)");
    /* The old remove cross is gone with the Edit mode. */
    expect(web.view).not.toContain("aria-label={`Remove ${card.name}`}");
    expect(web.view).not.toMatch(/import \{[^}]*\bX\b[^}]*\} from "lucide-react"/);
  });

  it("drops a held card on the Remove zone in the app", () => {
    /* Measured with onLayout against the page frame's parent; release
       over it calls onRemove instead of onMove, and the write goes
       through removeBinderCard. */
    expect(app.binder).toContain('accessibilityLabel="Remove from binder"');
    expect(app.binder).toContain("onRemove");
    expect(app.binder).toContain("removeBinderCard(");
    expect(app.binder).toContain("colors.danger");
    expect(app.binder).toMatch(/borderStyle:[^,\n]*"dashed"/);
    expect(app.binder).toContain("onLayout");
  });

  it("tells the owner how, under the page, once there is a card", () => {
    expect(web.view).toMatch(
      /cards\.length > 0 && \(\s*<p className="text-center text-xs text-text-muted">\s*Hold a card to move it, or drop it on Remove\.\s*<\/p>/,
    );
    expect(app.binder).toContain(HINT);
    expect(app.binder).toMatch(
      /colors\.textMuted[\s\S]{0,120}fontSize: 12|fontSize: 12[\s\S]{0,120}colors\.textMuted/,
    );
  });
});

describe("the settings sit behind a pencil at the top", () => {
  it("opens a Binder settings sheet from the title row on the web", () => {
    expect(web.view).toMatch(/import \{[^}]*\bPencil\b[^}]*\} from "lucide-react"/);
    expect(web.view).toContain('aria-label="Binder settings"');
    expect(web.view).toMatch(
      /<button[^>]*aria-label="Binder settings"[^>]*onClick=\{\(\) => setSettingsOpen\(true\)\}/,
    );
    /* The pencil sits in the same row as the h2, at its right end. */
    expect(web.view).toMatch(
      /<div className="flex items-start justify-between gap-3">[\s\S]*?<h2[\s\S]*?aria-label="Binder settings"/,
    );
    expect(web.view).toContain('import { Sheet } from "@/components/ui/sheet";');
    expect(web.view).toMatch(
      /<Sheet\s+open=\{settingsOpen\}\s+onClose=\{\(\) => setSettingsOpen\(false\)\}\s+title="Binder settings"\s*>\s*<BinderSettings/,
    );
    /* The settings are the sheet's body, no strip and no second heading. */
    expect(web.settings).not.toContain("<section");
    expect(web.settings).not.toMatch(/>\s*Binder\s*</);
    expect(web.settings).toContain("Name");
    expect(web.settings).toContain("<ForTradeSwitch");
    expect(web.settings).toContain("<BinderCover");
    expect(web.settings).toContain("Delete binder");
    expect(web.settings).toContain('title="Delete binder"');
    expect(web.settings).toContain('router.push("/profile?tab=binders")');
    /* Still saving at once: no Save button. */
    expect(web.settings).not.toMatch(/>\s*Save\s*</);
    expect(web.settings).toContain("saveBinderSettingsAction(patch, binderId)");
  });

  it("opens a Binder settings sheet from the header pencil in the app", () => {
    expect(app.binder).toContain("headerRight");
    expect(app.binder).toContain('"pencil-outline"');
    expect(app.binder).toContain('label="Binder settings"');
    expect(app.binder).toContain("colors.textPrimary");
    expect(appPage).toContain("SheetBackdrop");
    expect(appPage).toContain("DeleteBinderConfirm");
    expect(appPage).toContain("<BinderSettings");
    expect(appPage).toContain("deleteBinder(");
    expect(appPage).not.toMatch(/label="Save"/);
  });
});

describe("copy and colour rules", () => {
  it("has no em dashes and no literal hex in anything this round touched", () => {
    for (const [name, source] of [
      ["web view", web.view],
      ["web settings", web.settings],
      ["web add", web.add],
      ["app binder", app.binder],
      ["app settings sheet", app.settingsSheet],
    ] as const) {
      expect(source, name).not.toContain("\u2014");
      expect(source, name).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    }
  });
});
