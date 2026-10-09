import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Choice, Pocket } from "@/components/cards/page-check";
import * as rules from "@/lib/cards/scan-rules";
import type { CardResult } from "@/lib/cards/schema";

/**
 * Scanning whole binder pages on the website. The founder (2026-10-09):
 * "scan, let's say 5 pages of their binder into a queue and it auto
 * fills in an actual binder, with the exact same location the cards
 * were in in their binder." The app's twin is page-scan-app.test.ts;
 * the server half is page-scan.test.ts; the words are scan-rules.ts.
 */

/* The components import Server Actions; the tests never call them. */
vi.mock("@/lib/cards/scan-actions", () => ({
  scanCardAction: vi.fn(),
  scanPageAction: vi.fn(),
  scannerAccessAction: vi.fn(),
}));
vi.mock("@/lib/binder/actions", () => ({ placeBinderPagesAction: vi.fn() }));
vi.mock("@/lib/cards/actions", () => ({ searchCardsAction: vi.fn() }));

const read = (path: string) =>
  readFileSync(resolve(import.meta.dirname, "../..", path), "utf8");

const pages = read("src/components/cards/page-scan.tsx");
const check = read("src/components/cards/page-check.tsx");
const add = read("src/components/binder/add-binder-card.tsx");
const view = read("src/components/binder/binder-page.tsx");

/** The code alone: a comment may quote a word, the code may not retype it. */
const code = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const card = (id: string) => ({ id, printings: [] }) as unknown as CardResult;
const chose = (id: string, printingId: string | null = null): Choice => ({
  card: card(id),
  printingId,
});

describe("the scan tab has a switch: one card, or whole pages", () => {
  it("offers both, one card first and by default, on the scan tab alone", () => {
    expect(add).toContain(
      'const [scanMode, setScanMode] = useState<"one" | "pages">("one");',
    );
    expect(add).toMatch(/\["one", SCAN_ONE\],\s*\["pages", SCAN_PAGES\],/);
    /* A fresh sheet is back on one card. */
    expect(add).toMatch(/setTab\("search"\);\s*setScanMode\("one"\);/);
    /* The switch sits at the top of the scan tab, over either scanner. */
    const tab = add.indexOf(') : tab === "scan" ? (');
    const radios = add.indexOf('aria-label="How to scan"');
    const one = add.indexOf("<ScanCard");
    const whole = add.indexOf("<PageScan");
    expect(tab).toBeGreaterThan(-1);
    expect(radios).toBeGreaterThan(tab);
    expect(one).toBeGreaterThan(radios);
    expect(whole).toBeGreaterThan(one);
    expect(add).toMatch(/\{scanMode === "one" \? \(\s*<>\s*<BinderTray/);
    expect(add.match(/<PageScan\b/g)).toHaveLength(1);
  });

  it("keeps pages out of the tray: the sheet's Add is not drawn for them", () => {
    expect(add).toContain('const pageMode = tab === "scan" && scanMode === "pages";');
    expect(add).toMatch(/footer=\{\s*!pageMode && \(/);
    expect(pages).not.toContain("addBinderCardsAction");
    expect(pages).not.toContain("onAdd");
    expect(check).not.toContain("@/lib/binder/");
  });

  it("lands the way the tray's Add does: the line, the sheet closed, the binder redrawn", () => {
    expect(add).toMatch(
      /onPlaced=\{\(message, firstPocket\) => \{\s*onAdded\?\.\(message, firstPocket\);\s*onOpenChange\(false\);\s*router\.refresh\(\);/,
    );
  });
});

describe("the queue starts at the binder's first empty page", () => {
  it("reads the binder's pockets and starts past the last card", () => {
    expect(view).toContain("inBinder={cards}");
    expect(add).toContain(
      "const filled = useMemo(() => inBinder.map((card) => card.pocket), [inBinder]);",
    );
    expect(add).toContain("pockets={filled}");
    expect(pages).toContain(
      "const [startPage, setStartPage] = useState(() => firstEmptyPage(pockets));",
    );
  });

  it("steps between page 1 and the binder's last page, labelled in its own words", () => {
    expect(pages).toContain("{startingAtLine(startPage)}");
    expect(pages).toContain("setStartPage((page) => Math.max(1, page - 1))");
    expect(pages).toContain("setStartPage((page) => Math.min(lastStart, page + 1))");
    expect(pages).toContain(
      "const lastStart = BINDER_PAGES - Math.max(0, queue.length - 1);",
    );
    expect(pages).toContain("{PAGES_HINT}");
  });

  it("takes a page with the camera, up to MAX_SCAN_PAGES and never past the last page", () => {
    expect(pages).toContain('accept="image/*"');
    expect(pages).toContain('capture="environment"');
    expect(pages).toContain("{takePageLabel(nextPage)}");
    expect(pages).toContain("const nextPage = startPage + queue.length;");
    expect(pages).toContain(
      "const canTake = queue.length < MAX_SCAN_PAGES && nextPage <= BINDER_PAGES;",
    );
    expect(pages).toMatch(/\{canTake && \(\s*<Button/);
    expect(pages).not.toContain("useEffect(() => {\n    input");
  });
});

describe("each photo is cut into nine pockets in the browser", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("cuts with pocketCrop and shrinks each pocket to SCAN_LONG_EDGE, never larger", async () => {
    const draws: number[][] = [];
    const sizes: { width: number; height: number }[] = [];
    const canvas = () => {
      const self = {
        width: 0,
        height: 0,
        getContext: () => ({
          drawImage: (...args: unknown[]) => draws.push(args.slice(1) as number[]),
        }),
        toBlob: (done: (blob: Blob | null) => void) => {
          sizes.push({ width: self.width, height: self.height });
          done(new Blob([new Uint8Array(10)], { type: "image/jpeg" }));
        },
      };
      return self;
    };
    vi.stubGlobal("document", { createElement: canvas });
    vi.stubGlobal(
      "Image",
      class {
        src = "";
        naturalWidth = 3024;
        naturalHeight = 4032;
        decode() {
          return Promise.resolve();
        }
      },
    );

    const { cutPage } = await import("@/components/cards/page-scan");
    const cut = await cutPage(new Blob());
    expect(cut?.cells).toHaveLength(rules.POCKETS_PER_PAGE);
    for (let slot = 0; slot < rules.POCKETS_PER_PAGE; slot += 1) {
      const crop = rules.pocketCrop(slot, 3024, 4032);
      expect(draws[slot]?.slice(0, 4)).toEqual([
        crop.x,
        crop.y,
        crop.width,
        crop.height,
      ]);
      const size = sizes[slot]!;
      expect(Math.max(size.width, size.height)).toBeLessThanOrEqual(
        rules.SCAN_LONG_EDGE,
      );
      /* Shrunk in proportion, so a card is not squashed. */
      expect(size.width / size.height).toBeCloseTo(crop.width / crop.height, 2);
    }
  });

  it("never enlarges a small photo's pockets", async () => {
    const { scanSize } = await import("@/components/cards/scan-card");
    const crop = rules.pocketCrop(4, 900, 1260);
    expect(scanSize(crop.width, crop.height)).toEqual({
      width: crop.width,
      height: crop.height,
    });
  });

  it("sends a JPEG under SCAN_MAX_BYTES per pocket, the nine as cell0 to cell8", () => {
    expect(pages).toContain("const crop = pocketCrop(slot, width, height);");
    expect(pages).toContain("const size = scanSize(crop.width, crop.height);");
    expect(pages).toContain("const cell = await fitJpeg(canvas);");
    expect(pages).toContain(
      "cells.forEach((cell, slot) => form.append(`cell${slot}`, cell, `pocket${slot}.jpg`));",
    );
    expect(pages).toContain("const outcome = await scanPageAction(form);");
  });
});

describe("the queue is read one page at a time, in order", () => {
  it("hands the reader the first waiting page, and only when none is with it", () => {
    const reader = pages.slice(
      pages.indexOf("useEffect(() => {\n    if (reading.current)"),
    );
    expect(reader).toContain("if (reading.current) return;");
    expect(reader).toContain(
      'const next = queue.find((page) => page.status.kind === "waiting");',
    );
    /* A page still being cut holds the line: no skipping ahead. */
    expect(reader).toContain("if (!next?.cells) return;");
    expect(reader).toMatch(
      /reading\.current = true;\s*void readPage\(next\.cells\)\.then\(\(status\) => \{\s*reading\.current = false;/,
    );
    expect(pages.match(/readPage\(/g)).toHaveLength(2);
  });

  it("numbers the pages by their place in the queue from the starting page", () => {
    expect(pages).toContain("number={startPage + index}");
    expect(pages).toContain("page: startPage + index,");
    expect(pages).toContain(
      "setQueue((current) => current.filter((each) => each.id !== page.id));",
    );
  });

  it("says how each page is going in the shared words", async () => {
    const { pageTally, pageFailedLine } = await import("@/components/cards/page-scan");
    const pockets = [
      { slot: 0, state: "found", read: {}, matches: [] },
      { slot: 1, state: "unread", read: null },
      { slot: 2, state: "empty" },
    ] as unknown as Pocket[];
    expect(pageTally(pockets)).toEqual({ found: 1, cards: 2 });
    expect(pageFailedLine("limit")).toBe(rules.SCAN_REFUSALS.limit);
    expect(pageFailedLine(null)).toBe(rules.PAGE_FAILED);
    expect(pages).toContain("return pageStatusLine(number, tally.found, tally.cards);");
    expect(pages).toContain(": READING_PAGE;");
    expect(pages).toMatch(
      /status\.kind === "failed" && \(\s*<Button[^>]*>\s*\{RETAKE\}/,
    );
    expect(pages).toContain("{REMOVE_PAGE}");
    /* Check the pages, once one has read. */
    expect(pages).toMatch(
      /\{anyRead && \(\s*<Dock>\s*<Button[^\n]*onClick=\{\(\) => setStep\("check"\)\}>\s*\{CHECK_PAGES\}/,
    );
  });
});

describe("the pages are checked before anything is placed", () => {
  it("draws the check before the Add button, and the Add button only there", () => {
    const shoot = pages.indexOf('{step === "shoot" ? (');
    const grid = pages.indexOf("<PageCheck");
    const button = pages.indexOf("{addPagesLabel(chosen)}");
    expect(shoot).toBeGreaterThan(-1);
    expect(grid).toBeGreaterThan(shoot);
    expect(button).toBeGreaterThan(grid);
    expect(pages.match(/placeBinderPagesAction\(/g)).toHaveLength(1);
    expect(pages).toMatch(/onClick=\{place\}\s*>\s*\{addPagesLabel\(chosen\)\}/);
  });

  it("starts each pocket on the best guess, and nothing where there was none", async () => {
    const { firstChoices } = await import("@/components/cards/page-scan");
    const pockets = [
      {
        slot: 0,
        state: "found",
        read: {},
        matches: [
          { card: card("a"), printingId: "p" },
          { card: card("b"), printingId: null },
        ],
      },
      { slot: 1, state: "unread", read: null },
      { slot: 2, state: "empty" },
    ] as unknown as Pocket[];
    const choices = firstChoices(pockets);
    expect(choices).toHaveLength(rules.POCKETS_PER_PAGE);
    expect(choices[0]?.card.id).toBe("a");
    expect(choices[0]?.printingId).toBe("p");
    expect(choices.slice(1).every((choice) => choice === null)).toBe(true);
  });

  it("places each chosen card at pocketAt(start + queue place, slot), and no left-empty pocket", async () => {
    const { pagePlacements, pagesChosen } =
      await import("@/components/cards/page-scan");
    const empty: Choice[] = Array.from({ length: 9 }, () => null);
    const first = [...empty];
    first[0] = chose("a", "p");
    first[8] = chose("b");
    const third = [...empty];
    third[4] = chose("c");
    const queue = [first, empty, third, null];
    expect(pagePlacements(queue, 4)).toEqual([
      { pocket: rules.pocketAt(4, 0), cardId: "a", printingId: "p" },
      { pocket: rules.pocketAt(4, 8), cardId: "b", printingId: null },
      { pocket: rules.pocketAt(6, 4), cardId: "c", printingId: null },
    ]);
    /* Pages with a card chosen: a page left all empty, or not read, is not one. */
    expect(pagesChosen(queue)).toBe(2);
    expect(pages).toContain("const placements = pagePlacements(choices, startPage);");
    expect(pages).toContain(
      "const result = await placeBinderPagesAction(binderId, { placements });",
    );
  });

  it("Leave empty clears the pocket, so it is not sent", () => {
    expect(check).toMatch(
      /onLeaveEmpty=\{\(\) => \{\s*onChoose\(page\.id, pocket\.slot, null\);/,
    );
    expect(check).toMatch(/onClick=\{onLeaveEmpty\}>\s*\{LEAVE_EMPTY\}/);
  });

  it("checks a pocket with the single scan's parts and the site's search", () => {
    expect(check).toContain("<ScannedCard");
    expect(check).toContain("<PrintingChips");
    expect(check).toContain("<OtherMatch");
    expect(check).toContain("{IS_THIS_IT}");
    expect(check).toContain("{OTHER_MATCHES}");
    expect(check).toContain("<CardSearch");
    expect(check).toContain("{FIND_THE_CARD}");
    /* The search opens with the read name, in English first. */
    expect(check).toContain(
      'const lookFor = read ? read.englishName || read.name : "";',
    );
    expect(check).toContain("initialQuery={lookFor}");
    expect(check).toMatch(/<h3[^>]*>\s*Page \{page\.page\}\s*<\/h3>/);
    expect(check).toContain('className="grid grid-cols-3 gap-2"');
  });

  it("marks a pocket already full in this binder, and says the card is left out", () => {
    expect(check).toContain("taken={taken.has(pocketAt(page.page, pocket.slot))}");
    expect(check).toContain("{POCKET_TAKEN}");
    expect(check).toContain("{POCKET_UNREAD}");
    expect(check).toContain("{POCKET_EMPTY}");
    /* Not the "you have this" accent: a guess is not a card in hand. */
    expect(code(check)).not.toMatch(/(border|ring)-(accent|success)\b/);
  });
});

describe("every word is scan-rules.ts", () => {
  it("never retypes a shared word", () => {
    const words = Object.entries(rules as Record<string, unknown>).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    );
    for (const [name, word] of words) {
      for (const source of [code(pages), code(check), code(add)]) {
        expect(source, name).not.toContain(`"${word}"`);
        expect(source, name).not.toContain(`>${word}<`);
      }
    }
    for (const word of Object.values(rules.SCAN_REFUSALS)) {
      expect(code(pages)).not.toContain(word);
    }
    expect(code(pages)).not.toMatch(/`Take page|`Starting at page|`Add \$\{/);
  });
});
