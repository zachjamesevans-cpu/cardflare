import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import * as app from "../../mobile/src/scan-copy";
import * as site from "@/lib/cards/scan-rules";

/**
 * The scan check's three asks, in the app. The founder (2026-10-09):
 * the card picker in the check is the Flare screen's "down to the
 * pixel", except "when you click a card, it doesn't add a '1' to it,
 * then counts up. it's just one card, so adding the card should close
 * that screen"; a pocket the reader could not place says what it
 * "Might be one of these"; and the binder's line while pages are read
 * has a spinner, so it does not look static.
 *
 * Read off the source: the app has no renderer in the test run.
 */

const read = (path: string) =>
  readFileSync(resolve(import.meta.dirname, "../..", path), "utf8");
const code = (text: string) =>
  text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const src = {
  select: read("mobile/src/card-select.tsx"),
  viewer: read("mobile/src/card-viewer.tsx"),
  pages: read("mobile/src/page-scanner.tsx"),
  binder: read("mobile/src/screens/binder.tsx"),
  composer: read("mobile/src/screens/flare-composer.tsx"),
};

/** From one mark to the next. */
const between = (text: string, from: string, to: string) => {
  const start = text.indexOf(from);
  return start < 0 ? "" : text.slice(start, text.indexOf(to, start + from.length));
};

describe("the words", () => {
  it("are the website's, word for word", () => {
    expect(app.MIGHT_BE_THESE).toBe(site.MIGHT_BE_THESE);
    expect(app.MIGHT_BE_THESE).toBe("Might be one of these");
    for (const pages of [1, 5]) {
      for (const ready of [false, true]) {
        expect(app.pagesWaitingLine(pages, ready)).toBe(
          site.pagesWaitingLine(pages, ready),
        );
      }
    }
    expect(app.pagesWaitingLine(5, false)).toBe("Finding the cards on 5 pages");
    expect(app.pagesWaitingLine(5, true)).toBe("5 pages ready to check");
  });
});

describe("Find the card is the Flare picker, for one card", () => {
  it("is CardSelectSheet itself, not a copy, and the old list is gone", () => {
    expect(src.viewer).toContain('import { CardSelectSheet } from "./card-select";');
    expect(src.viewer).not.toContain("function ViewerSearch(");
    expect(src.viewer).not.toContain("useCardSearch");
    expect(src.viewer).not.toContain("GameSearchField");
  });

  it("opens in one-card mode, the read name typed, headed Find the card", () => {
    const tag = between(src.viewer, "<CardSelectSheet", "/>");
    expect(tag).toContain("visible={finding !== null}");
    expect(tag).toContain("title={FIND_THE_CARD}");
    expect(tag).toContain(
      "onPickOne={(hit, printingId) => choose({ hit, printingId })}",
    );
    expect(tag).toContain("searchFor={finding}");
    expect(tag).not.toContain("items=");
    expect(tag).not.toContain("onChange=");
    expect(src.viewer).toContain("setFinding({ text: pocket.lookFor });");
    /* Both doors open it: the pill on an unread pocket, and the button
       under the other guesses. */
    expect(src.viewer).toContain("<Pill label={FIND_THE_CARD} onPress={find} />");
    expect(src.viewer).toContain(
      '<Button label={FIND_THE_CARD} variant="secondary" onPress={find} />',
    );
  });

  it("is drawn inside the viewer, so iOS presents it over the viewer's Modal", () => {
    const viewer = src.viewer.slice(
      src.viewer.indexOf("export function CardViewer("),
      src.viewer.indexOf("/** Nine dots,"),
    );
    const sheet = viewer.indexOf("<CardSelectSheet");
    expect(sheet).toBeGreaterThan(-1);
    /* The last thing in the viewer's own root View. */
    expect(viewer.slice(sheet)).toMatch(/\/>\s*<\/View>\s*\);\s*}\s*$/);
  });

  it("chooses on a tap and closes, with no lines, no PickCount and no tray", () => {
    const pick = between(
      src.select,
      "const pick = (hit: CardHit, printingId: string | null = null) => {",
      "const art =",
    );
    expect(pick).toContain("if (onPickOne) {");
    expect(pick).toContain("onPickOne(hit, printingId);");
    expect(pick).toContain("onClose();");
    expect(pick).toContain("return;");
    /* No lines in one-card mode: every PickCount hangs off a line, so
       none is drawn, and the tray and Done give way to the inset. */
    expect(src.select).toContain(
      "const items: PickedLine[] = onPickOne ? [] : (lines ?? []);",
    );
    expect(src.select).toContain(
      "const footer = onPickOne ? <View style={{ height: insets.bottom }} /> : given;",
    );
    const sheet = code(
      src.select.slice(src.select.indexOf("export function CardSelectSheet(")),
    );
    const counts = sheet.match(/<PickCount\b/g) ?? [];
    expect(counts).toHaveLength(2);
    expect(sheet).toContain("{anyLine ? (");
    expect(sheet).toContain("{line ? (");
    expect(sheet).toContain("const anyLine = items.find(");
    expect(sheet).toContain("const line = items.find(");
  });

  it("leaves the Flare composer's picker exactly as it was", () => {
    const open = src.composer.slice(src.composer.indexOf("<CardSelectSheet"));
    const tag = open.slice(0, open.indexOf("/>"));
    expect(tag).toContain("items={draft.items}");
    expect(tag).toContain("onChange={setItems}");
    expect(tag).not.toContain("onPickOne");
    expect(tag).not.toContain("title=");
    expect(src.select).toContain('title = "Select cards",');
    expect(src.select).toContain(
      "<Button label={`Done (${items.length})`} onPress={onClose} />",
    );
    expect(src.select).toContain(
      '"Search by name or number. Tap a card to add it; tap again for another copy."',
    );
  });
});

describe("Might be one of these", () => {
  it("is carried from an unread pocket to the viewer", () => {
    expect(src.pages).toContain(
      'suggestions: pocket.state === "unread" ? pocket.suggestions : undefined,',
    );
    expect(src.viewer).toContain("suggestions?: ScanMatch[];");
  });

  it("shows the heading and the cards for an unread pocket, a tap choosing one", () => {
    const pane = src.viewer.slice(src.viewer.indexOf("function Pane("));
    expect(pane).toContain(
      'const suggestions = pocket.state === "unread" ? (pocket.suggestions ?? []) : [];',
    );
    const block = between(pane, "{suggestions.length > 0 ? (", "</ScrollView>");
    expect(block).toContain("{MIGHT_BE_THESE}");
    expect(block).toContain("{maybe.name}");
    expect(block).toContain("{maybe.cardNumber}");
    expect(block).toContain("uri={leadArt(maybe)}");
    expect(block).toContain(
      "onPress={() => onChoose({ hit: maybe, printingId: match.printingId })}",
    );
    /* A wrapping row, never a horizontal scroller inside the pager. */
    expect(block).not.toContain("<ScrollView");
    expect(block).toContain('flexWrap: "wrap"');
    /* The tap is the viewer's onPick, as an other guess's is. */
    expect(src.viewer).toContain("onChoose={(next) => onPick(at, next)}");
  });

  it("keeps Find the card for an unread pocket", () => {
    const menu = between(src.viewer, "<View style={styles.actions}>", "{panel ? (");
    expect(menu).toContain("<Pill label={FIND_THE_CARD} onPress={find} />");
  });
});

describe("the binder's line while pages are read", () => {
  it("has the accent spinner on the right until ready, then Check now", () => {
    const banner = between(src.binder, "queues.map((queue) => (", "))");
    const line = banner.indexOf("{pagesWaitingLine(queue.pages, queue.ready)}");
    const ready = banner.indexOf("{queue.ready ? (");
    const spinner = banner.indexOf(
      '<ActivityIndicator size="small" color={colors.accent} />',
    );
    expect(line).toBeGreaterThan(-1);
    expect(ready).toBeGreaterThan(line);
    expect(banner.indexOf("{CHECK_NOW}")).toBeGreaterThan(ready);
    /* The spinner is the not-ready side, after Check now in the source. */
    expect(spinner).toBeGreaterThan(banner.indexOf("{CHECK_NOW}"));
    expect(banner.slice(ready, spinner)).toMatch(/\) : \(\s*$/);
  });
});
