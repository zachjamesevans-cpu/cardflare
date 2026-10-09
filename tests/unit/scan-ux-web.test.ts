import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { Pocket } from "@/components/cards/page-check";
import * as rules from "@/lib/cards/scan-rules";

/**
 * One scanner, a full-screen card viewer, no tabs, and the glowing PRO
 * mark, on the website. The founder (2026-10-09):
 *
 * - "a unified scan - it can detect if it's scanning a full page and
 *   says you need pro for that."
 * - "it should just have a popup full card viewer and a contextual menu
 *   there. i didn't even know i had to scroll down."
 * - "all the tabs of 'scan' etc having 3 tabs seems redundant."
 * - "change the pro font on site, app, etc. to a glowing green pro
 *   moniker that matches our main brand color."
 *
 * The app's twin is scan-ux-app.test.ts; the words are scan-rules.ts.
 */

/* The components import Server Actions; the tests never call them. */
vi.mock("@/lib/cards/scan-actions", () => ({
  scanCardAction: vi.fn(),
  scanPageAction: vi.fn(),
  scannerAccessAction: vi.fn(),
  scanRightsAction: vi.fn(),
}));
vi.mock("@/lib/cards/page-job-actions", () => ({
  sendPageAction: vi.fn(),
  queuesForAction: vi.fn(),
  queueViewAction: vi.fn(),
  placeQueueAction: vi.fn(),
  discardQueueAction: vi.fn(),
}));
vi.mock("@/lib/cards/actions", () => ({ searchCardsAction: vi.fn() }));

const read = (path: string) =>
  readFileSync(resolve(import.meta.dirname, "../..", path), "utf8");

const add = read("src/components/binder/add-binder-card.tsx");
const picker = read("src/components/binder/binder-picker.tsx");
const search = read("src/components/cards/card-search.tsx");
const scanner = read("src/components/cards/scanner.tsx");
const viewer = read("src/components/cards/card-viewer.tsx");
const check = read("src/components/cards/page-check.tsx");
const single = read("src/components/cards/scan-card.tsx");
const fullScreen = read("src/components/ui/full-screen.tsx");
const proWords = read("src/components/stores/pro-words.tsx");

/** The code alone: a comment may quote a word, the code may not retype it. */
const code = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/** Where `needle` is in `source`, failing the test when it is not there. */
const at = (source: string, needle: string) => {
  const index = source.indexOf(needle);
  expect(index, needle).toBeGreaterThan(-1);
  return index;
};

describe("Add cards has no tabs", () => {
  it("is the search, then Scan, then Paste a list, with no tab list and no switch", () => {
    expect(add).not.toContain('role="tablist"');
    expect(add).not.toContain('role="radiogroup"');
    expect(add).not.toContain("SCAN_CARD");
    expect(add).not.toContain("scanMode");
    /* Both sit under the search's field, over its results. */
    expect(add).toContain("underField={");
    expect(picker).toContain("underField={underField}");
    const field = at(search, "aria-describedby={`${inputId}-hint`}");
    const under = at(search, "{underField}");
    const results = at(search, 'aria-label="Card results"');
    expect(under).toBeGreaterThan(field);
    expect(results).toBeGreaterThan(under);
    /* Scan first, large, with the camera; Paste a list a small link after. */
    const scan = at(code(add), "{SCAN_TITLE}");
    const paste = at(code(add), "Paste a list");
    expect(paste).toBeGreaterThan(scan);
    expect(add).toMatch(
      /\{scans && \(\s*<Button\s+type="button"\s+size="lg"[\s\S]*?<Camera[^>]*\/>\s*\{SCAN_TITLE\}/,
    );
  });

  it("opens the pasted list from the link, with a way back to the search", () => {
    expect(add).toContain(
      'const [view, setView] = useState<"search" | "paste">("search");',
    );
    expect(add).toMatch(/setView\("paste"\);[\s\S]*?>\s*Paste a list\s*</);
    expect(add).toMatch(/setView\("search"\);[\s\S]*?<ArrowLeft[^>]*\/>\s*Search\s*</);
  });

  it("keeps the tray and its one Add button as they were", () => {
    expect(add).toContain("<BinderPicker");
    expect(picker).toContain("<BinderTray");
    expect(add).toContain("{addLabel(count)}");
    expect(add).not.toContain("pageMode");
  });
});

describe("the scanner is one flow, a single read first", () => {
  it("is full screen over the sheet: the native dialog, opened modally", () => {
    expect(scanner).toContain("<FullScreen label={SCAN_TITLE}");
    expect(fullScreen).toContain("element.showModal()");
    expect(fullScreen).toContain(
      "fixed inset-0 m-0 h-dvh max-h-none w-full max-w-none",
    );
    expect(add).toMatch(
      /onClick=\{\(\) => \{\s*setError\(null\);\s*setScanning\(true\);/,
    );
  });

  it("says a card, then a page with PRO, then the hint, then the free scans left", () => {
    const single = at(scanner, "{SCAN_INTRO_SINGLE}");
    const pages = at(scanner, "{SCAN_INTRO_PAGES} <ProMark />");
    const hint = at(scanner, "{FILL_THE_FRAME}");
    const left = at(scanner, "{freeScansLeftLine(singlesLeft)}");
    expect(pages).toBeGreaterThan(single);
    expect(hint).toBeGreaterThan(pages);
    expect(left).toBeGreaterThan(hint);
    expect(scanner).toContain("{singlesLeft !== null && (");
    /* One soft outline in a card's shape, which is a page's shape too. */
    expect(scanner).toContain("aspect-[5/7]");
  });

  it("reads every photo as a single card first, the full-size photo kept until the answer", () => {
    const keep = at(scanner, "kept.current = file;");
    const readIt = at(scanner, "const answer = await readPhoto(file);");
    const take = at(scanner, "const photo = kept.current;");
    expect(readIt).toBeGreaterThan(keep);
    expect(take).toBeGreaterThan(readIt);
    expect(single).toContain("export async function readPhoto(file: Blob)");
  });

  it("sends a page as a page for somebody who scans pages, else the PRO screen", () => {
    expect(scanner).toMatch(
      /if \(reason === "is-page"\) \{\s*if \(rights\.pages === "on" && photo\) await sendAsPage\(photo\);\s*else setStep\(\{ kind: "pro", why: PAGES_ARE_PRO \}\);/,
    );
    /* Cut from the kept photo at full size, the page scanner's own helpers. */
    expect(scanner).toContain("photos = await cutPage(file);");
    expect(scanner).toContain(
      'import { cutPage, sendPage, sendRefusalLine } from "@/components/cards/page-scan";',
    );
  });

  it("shows the PRO screen when the day's free scans are gone", () => {
    expect(scanner).toMatch(
      /if \(reason === "daily-singles"\) \{\s*setSinglesLeft\(0\);\s*setStep\(\{ kind: "pro", why: SCAN_REFUSALS\["daily-singles"\] \}\);/,
    );
    /* Known gone before the shot: nothing is sent at all. */
    expect(scanner).toMatch(
      /if \(rights\.singles === "used-up" \|\| singlesLeft === 0\) \{\s*setStep\(\{ kind: "pro", why: SCAN_REFUSALS\["daily-singles"\] \}\);\s*return;/,
    );
  });

  it("draws the PRO screen as: the reason, PRO large, Get Pro, Try again", () => {
    const screen = scanner.slice(scanner.indexOf("function ProScreen("));
    const why = at(screen, "<ProWords text={why} />");
    const mark = at(screen, '<ProMark className="text-6xl" />');
    const get = at(screen, "{GET_PRO}");
    const again = at(screen, "{SCAN_AGAIN}");
    expect(mark).toBeGreaterThan(why);
    expect(get).toBeGreaterThan(mark);
    expect(again).toBeGreaterThan(get);
    expect(screen).toMatch(
      /<Link href="\/pro" className=\{buttonStyles\("primary", "lg"\)\}>\s*\{GET_PRO\}/,
    );
  });

  it("opens the card viewer on a card, and That's it puts it in the tray and goes back to the camera", () => {
    expect(scanner).toMatch(
      /<CardViewer\s+label=\{SCAN_TITLE\}\s+items=\{\[step\.item\]\}/,
    );
    expect(scanner).toMatch(/onConfirm=\{\(\) => \{[\s\S]*?onAdd\([\s\S]*?again\(\);/);
    expect(scanner).toContain(
      'const again = () => {\n    release();\n    setStep({ kind: "camera" });',
    );
  });

  it("numbers pages from the binder's first empty page, with a Page chip after the first", () => {
    expect(scanner).toContain("() => retake?.page ?? firstEmptyPage(pockets),");
    expect(scanner).toMatch(/\{anyPage && !retake && \(\s*<PageChip/);
    expect(scanner).toContain("const anyPage = sent + inFlight > 0;");
    expect(scanner).toContain("Page {page}");
    expect(scanner).toMatch(
      /\{!retake && sent > 0 && typeof leftNow === "number" && \(/,
    );
  });

  it("says Page 4 added for a moment, and keeps the camera open", () => {
    expect(scanner).toContain(
      "setToast({ line: pageAddedLine(number), alert: false });",
    );
    expect(scanner).toContain(
      "const timer = window.setTimeout(() => setToast(null), TOAST_MS);",
    );
    /* Back to the camera as soon as the page is cut, before it is sent. */
    const cut = at(scanner, "const cut = photos;");
    const camera = scanner.indexOf('setStep({ kind: "camera" });', cut);
    const chain = at(scanner, "chain.current = chain.current.then(");
    expect(camera).toBeGreaterThan(cut);
    expect(chain).toBeGreaterThan(camera);
  });

  it("closes on Done once the pages on their way have landed, back to the sheet", () => {
    expect(scanner).toContain(
      "if (!finishing || inFlight > 0 || closed.current) return;",
    );
    expect(add).toMatch(/onDone=\{\(sentPages\) => \{\s*setScanning\(false\);/);
    expect(add).toContain("{READING_IN_BACKGROUND}");
  });

  it("has no old shoot step left", () => {
    const pages = read("src/components/cards/page-scan.tsx");
    expect(pages).not.toContain("export function PageScan");
    expect(pages).not.toContain("takePageLabel");
    expect(single).not.toContain("export function ScanCard");
  });
});

describe("the card viewer, for a single scan and for the check alike", () => {
  it("is used by both", () => {
    expect(scanner).toContain("<CardViewer");
    expect(check).toContain("<CardViewer");
    expect(check).not.toContain("PocketDetail");
  });

  it("shows your photo beside our match, one at a time on a narrow screen", () => {
    expect(viewer).toContain("<Face word={YOUR_PHOTO}");
    expect(viewer).toContain("<Face word={OUR_MATCH}");
    expect(viewer).toContain(
      'className={cn("grid gap-4", item.photo && "sm:grid-cols-2")}',
    );
    expect(viewer).toContain('showing ? "flex" : "hidden sm:flex"');
    expect(viewer).toContain("<ScannedCard");
  });

  it("puts NOT_SURE and the note on top when unsure, the note under the match otherwise", () => {
    const top = at(viewer, "{NOT_SURE}");
    const faces = at(viewer, "<Face word={YOUR_PHOTO}");
    const under = at(viewer, "{!unsure && item.note && (");
    expect(faces).toBeGreaterThan(top);
    expect(under).toBeGreaterThan(faces);
  });

  it("offers That's it, Other printing, Not this card, Leave empty, in that order", () => {
    const menu = viewer.slice(viewer.indexOf("{/* The menu, in the app's order. */}"));
    const order = [
      "{THATS_IT}",
      "{OTHER_PRINTING}",
      "{NOT_THIS_CARD}",
      "{LEAVE_EMPTY}",
    ].map((word) => at(menu, word));
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    /* Never a button that cannot work. */
    expect(viewer).toContain("{choice && choice.card.printings.length > 1 && (");
    expect(viewer).toContain("{onLeaveEmpty && choice && (");
  });

  it("opens the other guesses from Not this card, then the picker with the read name", () => {
    expect(viewer).toMatch(
      /onClick=\{\(\) => setMenu\(menu === "other" \? null : "other"\)\}/,
    );
    expect(viewer).toMatch(
      /\{menu === "other" && \([\s\S]*?word=\{OTHER_MATCHES\}[\s\S]*?onClick=\{onFind\}>\s*\{FIND_THE_CARD\}/,
    );
    expect(viewer).toMatch(/\{picking \? \([\s\S]*?initialQuery=\{item\.lookFor\}/);
    expect(viewer).toMatch(
      /\{menu === "printing" && choice && \([\s\S]*?<PrintingChips/,
    );
  });

  it("steps with arrow buttons, the keyboard's arrows and a swipe", async () => {
    expect(viewer).toContain('if (event.key === "ArrowLeft") step(-1);');
    expect(viewer).toContain('if (event.key === "ArrowRight") step(1);');
    expect(viewer).toContain("onTouchStart=");
    expect(viewer).toContain("step(dx < 0 ? 1 : -1);");
    expect(viewer).toContain("<ChevronLeft");
    expect(viewer).toContain("<ChevronRight");
    const { SWIPE_PX } = await import("@/components/cards/card-viewer");
    expect(SWIPE_PX).toBe(48);
  });

  it('says where you are on a page: "Page 4" and nine dots', () => {
    expect(viewer).toContain(
      "{item.place && <Whereabouts page={item.place.page} slot={item.place.slot} />}",
    );
    expect(viewer).toContain("Array.from({ length: POCKETS_PER_PAGE }");
  });
});

describe("the check opens the viewer from its tiles", () => {
  it("draws our match's art on each tile, a ? for unread, and the unsure mark", () => {
    expect(check).toContain(
      "<ChoiceFace choice={choice} photo={photo} imagesEnabled={imagesEnabled} />",
    );
    expect(check).toMatch(
      /pocket\.state === "unread" \? \(\s*<span[^>]*>\s*\?\s*<\/span>/,
    );
    expect(check).toMatch(/\{unsure\(pocket\) && \(\s*<span[^>]*>\s*<CircleHelp/);
  });

  it("opens the viewer at the tapped pocket, over every pocket of every page", () => {
    expect(check).toContain('aria-haspopup="dialog"');
    expect(check).toMatch(/onOpen=\{\(\) =>\s*setWalk\(\{\s*list: every,/);
    expect(check).not.toContain("aria-expanded");
  });

  it("That's it keeps the card and steps on; past the last, back to the grid", () => {
    expect(check).toMatch(/onConfirm=\{\(\) => \{\s*looked\(here\);\s*onward\(\);/);
    expect(check).toContain(": null,");
  });

  it("walks only the unsure and unread pockets from Check N unsure", async () => {
    expect(check).toContain("{checkUnsureLabel(unsureLeft.length)}");
    expect(check).toContain("onClick={() => setWalk({ list: unsureLeft, at: 0 })}");
    expect(check).toMatch(
      /return found && doubtful\(found\.pocket\) && !checked\.has\(keyOf\(at\)\);/,
    );
    const { doubtful } = await import("@/components/cards/page-check");
    const found = (sure?: boolean) =>
      ({ slot: 0, state: "found", read: {}, matches: [], sure }) as unknown as Pocket;
    expect(doubtful(found(false))).toBe(true);
    expect(doubtful(found(true))).toBe(false);
    expect(doubtful(found(undefined))).toBe(false);
    expect(doubtful({ slot: 0, state: "unread", read: null } as Pocket)).toBe(true);
    expect(doubtful({ slot: 0, state: "empty" })).toBe(false);
    expect(rules.checkUnsureLabel(2)).toBe("Check 2 unsure");
  });

  it("keeps Add N pages and Throw these pages away", () => {
    const queue = read("src/components/cards/queue-check.tsx");
    expect(queue).toContain("{addPagesLabel(chosen)}");
    expect(queue).toContain("{THROW_PAGES_AWAY}");
  });
});

describe("every word is scan-rules.ts", () => {
  it("never retypes a shared word", () => {
    const words = Object.entries(rules as Record<string, unknown>).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    );
    for (const [name, word] of words) {
      for (const source of [code(scanner), code(viewer), code(check), code(add)]) {
        expect(source, name).not.toContain(`"${word}"`);
        expect(source, name).not.toContain(`>${word}<`);
      }
    }
    for (const source of [code(scanner), code(viewer), code(check)]) {
      for (const word of Object.values(rules.SCAN_REFUSALS)) {
        expect(source).not.toContain(word);
      }
      expect(source).not.toMatch(/free scans left|added\. Reading|`Check \$\{/);
    }
  });
});

describe("the PRO mark", () => {
  it("swaps the word Pro in a shared sentence for the mark, and nothing else", async () => {
    const { ProWords } = await import("@/components/stores/pro-words");
    const html = renderToStaticMarkup(
      createElement(ProWords, { text: rules.PAGES_ARE_PRO }),
    );
    expect(html).toBe(
      'Scanning whole binder pages is <span class="pro-mark" aria-label="Pro">Pro</span>.',
    );
    const words = renderToStaticMarkup(
      createElement(ProWords, { text: rules.SCAN_REFUSALS["daily-singles"] }),
    );
    expect(words.match(/class="pro-mark"/g)).toHaveLength(1);
    expect(proWords).toContain(
      'import { ProMark } from "@/components/stores/ultra-mark";',
    );
  });

  it("names the tier with ProMark everywhere this round changed it", () => {
    const spots: [string, RegExp][] = [
      ["src/components/cards/scanner.tsx", /\{SCAN_INTRO_PAGES\} <ProMark \/>/],
      ["src/components/trades/history.tsx", /with cardflare <ProMark \/>\./],
      [
        "src/components/trades/history.tsx",
        /bg-accent\/10 px-2\.5 py-1 text-xs">\s*<ProMark \/>/,
      ],
      ["src/components/players/cosmetic-shop.tsx", /<ProMark \/> to wear/],
      ["src/components/marketing/pricing.tsx", /See <ProMark \/>/],
      ["src/app/profile/customize/page.tsx", /a cardflare <ProMark \/> feature\./],
      ["src/app/profile/customize/page.tsx", /Get <ProMark \/>\s*<\/Link>/],
      ["src/app/pro/page.tsx", /You are on <ProMark \/>/],
      ["src/app/pro/page.tsx", /<ProMark \/> is for player accounts/],
      ["src/app/pro/page.tsx", /<ProMark \/> goes on top of it/],
      ["src/app/pro/page.tsx", /then cardflare <ProMark \/>\./],
      ["src/app/pro/page.tsx", /\{SITE\.name\} <ProMark \/>/],
      ["src/app/profile/settings/page.tsx", /<ProMark \/> through the App Store/],
    ];
    for (const [path, pattern] of spots) {
      expect(read(path), path).toMatch(pattern);
    }
  });

  it("is never styled by hand", () => {
    for (const path of [
      "src/components/cards/scanner.tsx",
      "src/components/cards/card-viewer.tsx",
      "src/components/binder/add-binder-card.tsx",
      "src/components/trades/history.tsx",
      "src/components/players/cosmetic-shop.tsx",
      "src/components/marketing/pricing.tsx",
      "src/app/profile/customize/page.tsx",
      "src/app/profile/settings/page.tsx",
    ]) {
      const source = code(read(path));
      expect(source, path).not.toContain("gold-text");
      expect(source, path).not.toMatch(/className="[^"]*pro-mark/);
      /* The tier as bare text in markup, outside a button that wears the lime. */
      expect(source, path).not.toMatch(/>\s*Pro\s*</);
      expect(source, path).not.toMatch(/"See Pro"|Pro to wear|cardflare Pro\./);
    }
  });
});
