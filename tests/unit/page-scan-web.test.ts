import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import * as rules from "@/lib/cards/scan-rules";

/**
 * Scanning whole binder pages on the website. The founder (2026-10-09):
 * "scan, let's say 5 pages of their binder into a queue and it auto
 * fills in an actual binder, with the exact same location the cards
 * were in in their binder." The app's twin is page-scan-app.test.ts;
 * the server half is page-scan.test.ts; the words are scan-rules.ts.
 * Pages are now sent to be read in the background: the queue, the
 * banner and the check from the server are page-queue-web.test.ts. And
 * there is one scanner for a card or a page, the single read deciding
 * which: scan-ux-web.test.ts.
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
vi.mock("@/lib/binder/actions", () => ({ placeBinderPagesAction: vi.fn() }));
vi.mock("@/lib/cards/actions", () => ({ searchCardsAction: vi.fn() }));

const read = (path: string) =>
  readFileSync(resolve(import.meta.dirname, "../..", path), "utf8");

const pages = read("src/components/cards/page-scan.tsx");
const scanner = read("src/components/cards/scanner.tsx");
const viewer = read("src/components/cards/card-viewer.tsx");
const check = read("src/components/cards/page-check.tsx");
const queueCheck = read("src/components/cards/queue-check.tsx");
const add = read("src/components/binder/add-binder-card.tsx");
const view = read("src/components/binder/binder-page.tsx");

/** The code alone: a comment may quote a word, the code may not retype it. */
const code = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("pages come through the one scanner, never the tray", () => {
  it("has no switch: the single read says when a photo is a page", () => {
    expect(add).not.toContain("scanMode");
    expect(add).not.toContain("SCAN_ONE");
    expect(add).not.toContain("SCAN_PAGES");
    expect(add).not.toContain("<PageScan");
    expect(pages).not.toContain("export function PageScan");
    expect(scanner).toMatch(
      /if \(reason === "is-page"\) \{\s*if \(rights\.pages === "on" && photo\) await sendAsPage\(photo\);/,
    );
  });

  it("keeps pages out of the tray: a page is sent, never handed to onAdd", () => {
    const send = scanner.slice(
      scanner.indexOf("const sendAsPage = async"),
      scanner.indexOf("const shoot = async"),
    );
    expect(send).toContain("await sendPage(binderId, batchId, number, cut)");
    expect(send).not.toContain("onAdd");
    expect(pages).not.toContain("addBinderCardsAction");
    expect(pages).not.toContain("onAdd");
    expect(check).not.toContain("@/lib/binder/");
  });

  it("closes on Done, a new queue each time the sheet opens", () => {
    expect(add).toMatch(/onDone=\{\(sentPages\) => \{\s*setScanning\(false\);/);
    expect(add).toContain("setSession((count) => count + 1);");
    expect(add).toContain("key={session}");
  });
});

describe("the queue starts at the binder's first empty page", () => {
  it("reads the binder's pockets and starts past the last card", () => {
    expect(view).toContain("inBinder={cards}");
    expect(add).toContain(
      "const filled = useMemo(() => inBinder.map((card) => card.pocket), [inBinder]);",
    );
    expect(add).toContain("pockets={filled}");
    expect(scanner).toMatch(
      /const \[nextPage, setNextPage\] = useState\(\s*\(\) => retake\?\.page \?\? firstEmptyPage\(pockets\),\s*\);/,
    );
  });

  it("steps between page 1 and the binder's last page from the Page chip", () => {
    expect(scanner).toContain("{startingAtLine(page)}");
    expect(scanner).toContain(
      "setNextPage((page) => Math.min(BINDER_PAGES, Math.max(1, page + by)))",
    );
    expect(scanner).toContain("disabled={page <= 1}");
    expect(scanner).toContain("disabled={page >= BINDER_PAGES}");
    expect(scanner).toContain("label={START_EARLIER}");
    expect(scanner).toContain("label={START_LATER}");
  });

  it("takes a photo with the camera, and a retake only the one page", () => {
    expect(scanner).toContain('accept="image/*"');
    expect(scanner).toContain('capture="environment"');
    expect(scanner).toContain("const canShoot = !finishing && !(retake && anyPage);");
    expect(scanner).toMatch(/canShoot && \(\s*<Button/);
    expect(scanner).toContain("setNextPage(Math.min(BINDER_PAGES, number + 1));");
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

  it("cuts the whole page too, at PAGE_LONG_EDGE, after its pockets", async () => {
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
    const { cutPage, PAGE_LONG_EDGE } = await import("@/components/cards/page-scan");
    const cut = await cutPage(new Blob());
    expect(cut?.page).toBeInstanceOf(Blob);
    expect(draws[rules.POCKETS_PER_PAGE]?.slice(0, 4)).toEqual([0, 0, 3024, 4032]);
    const whole = sizes[rules.POCKETS_PER_PAGE]!;
    expect(Math.max(whole.width, whole.height)).toBe(PAGE_LONG_EDGE);
    expect(PAGE_LONG_EDGE).toBe(1568);
  });

  it("sends the whole page and the nine pockets, each JPEG under SCAN_MAX_BYTES", () => {
    expect(pages).toContain("const crop = pocketCrop(slot, width, height);");
    expect(pages).toContain("const size = scanSize(crop.width, crop.height);");
    expect(pages).toContain("page.size <= SCAN_MAX_BYTES &&");
    expect(pages).toContain("fitted.every((cell) => cell.size <= SCAN_MAX_BYTES) &&");
    expect(pages).toContain('form.append("page", photos.page, "page.jpg");');
    expect(pages).toContain("form.append(`pocket${slot}`, cell, `pocket${slot}.jpg`),");
    expect(pages).toContain("const outcome = await sendPageAction(form);");
  });
});

describe("the queue is sent one page at a time, in order", () => {
  it("chains each page behind the one before it", () => {
    expect(scanner).toContain(
      "const chain = useRef<Promise<void>>(Promise.resolve());",
    );
    expect(scanner).toMatch(
      /chain\.current = chain\.current\.then\(async \(\) => \{\s*const outcome = await sendPage\(binderId, batchId, number, cut\);/,
    );
  });

  it("numbers each page when it is taken, and keeps the number", () => {
    expect(scanner).toContain("const number = nextPage;");
    expect(scanner).toContain("Page {page}");
    /* A page that did not go is the next page again. */
    expect(scanner).toContain(
      "setNextPage((page) => (page === number + 1 ? number : page));",
    );
  });

  it("says how each page went in the shared words", async () => {
    const { sendRefusalLine } = await import("@/components/cards/page-scan");
    expect(sendRefusalLine("limit")).toBe(rules.SCAN_REFUSALS.limit);
    expect(sendRefusalLine("daily-pages")).toBe(rules.SCAN_REFUSALS["daily-pages"]);
    expect(sendRefusalLine("queue-full")).toBe(rules.QUEUE_FULL);
    expect(sendRefusalLine("not-yours")).toBe(rules.SCAN_REFUSALS.unavailable);
    expect(scanner).toContain(
      "setToast({ line: pageAddedLine(number), alert: false });",
    );
    expect(scanner).toContain(
      "setToast({ line: sendRefusalLine(outcome.reason), alert: true });",
    );
    expect(scanner).toMatch(/\{inFlight > 0 && \([\s\S]*?\{SENDING_PAGE\}/);
  });
});

describe("the pages are checked from the server before anything is placed", () => {
  it("Leave empty clears the pocket, so it is not sent", () => {
    expect(check).toMatch(
      /onLeaveEmpty=\{\(\) => \{\s*onChoose\(here\.id, here\.slot, null\);/,
    );
    expect(viewer).toMatch(/onClick=\{onLeaveEmpty\}>\s*\{LEAVE_EMPTY\}/);
  });

  it("checks a pocket in the card viewer, with the single scan's parts and the site's search", () => {
    expect(check).toContain("<CardViewer");
    expect(viewer).toContain("<ScannedCard");
    expect(viewer).toContain("<PrintingChips");
    expect(viewer).toContain("<OtherMatch");
    expect(viewer).toContain("{OTHER_MATCHES}");
    expect(viewer).toContain("<CardSearch");
    expect(viewer).toContain("{FIND_THE_CARD}");
    /* The search opens with the read name, in English first. */
    expect(check).toContain('lookFor: read ? read.englishName || read.name : "",');
    expect(viewer).toContain("initialQuery={item.lookFor}");
    expect(check).toMatch(/<h3[^>]*>\s*Page \{page\.page\}\s*<\/h3>/);
    expect(check).toContain('className="grid grid-cols-3 gap-2"');
  });

  it("marks a pocket already full in this binder, and says the card is left out", () => {
    expect(check).toContain("taken={taken.has(pocketAt(page.page, pocket.slot))}");
    expect(check).toContain(
      "taken: page ? taken.has(pocketAt(page.page, at.slot)) : false,",
    );
    expect(viewer).toContain("{POCKET_TAKEN}");
    expect(viewer).toContain("{POCKET_UNREAD}");
    expect(viewer).toContain("{POCKET_EMPTY}");
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
      for (const source of [
        code(pages),
        code(check),
        code(add),
        code(queueCheck),
        code(scanner),
        code(viewer),
      ]) {
        expect(source, name).not.toContain(`"${word}"`);
        expect(source, name).not.toContain(`>${word}<`);
      }
    }
    for (const word of Object.values(rules.SCAN_REFUSALS)) {
      expect(code(pages)).not.toContain(word);
    }
    expect(code(scanner)).not.toMatch(/`Take page|`Starting at page|`Add \$\{/);
    expect(code(queueCheck)).not.toMatch(/`Add \$\{|Reading\.\.\./);
  });
});
