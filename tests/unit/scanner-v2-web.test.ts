import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

import type { Pocket } from "@/components/cards/page-check";
import { cornersMakeAPage, type Quad } from "@/lib/cards/page-geometry";
import type { QueuedPage, VisionView } from "@/lib/cards/page-jobs";
import * as rules from "@/lib/cards/scan-rules";

/**
 * The second scanner, on the website. The founder (2026-10-13): every
 * pocket named A1 to C3 and coloured by status, matched green, needs
 * review yellow, empty grey, can't identify red; a pocket can be read
 * again on its own; a page the scanner is unsure of is lined up by hand,
 * never guessed; and nothing in the binder is overwritten without a yes.
 * The words are scan-rules.ts; placing's "ask" then "replace" is pinned
 * in page-queue-web.test.ts, the single photo sent in page-scan-web.
 */

/* The components import Server Actions; the tests never call them. */
vi.mock("@/lib/cards/page-job-actions", () => ({
  sendPageAction: vi.fn(),
  queuesForAction: vi.fn(),
  queueViewAction: vi.fn(),
  placeQueueAction: vi.fn(),
  discardQueueAction: vi.fn(),
  realignPageAction: vi.fn(),
  rescanPocketAction: vi.fn(),
}));
vi.mock("@/lib/cards/scan-actions", () => ({
  scanCardAction: vi.fn(),
  scanPageAction: vi.fn(),
  scannerAccessAction: vi.fn(),
  scanRightsAction: vi.fn(),
}));
vi.mock("@/lib/cards/actions", () => ({ searchCardsAction: vi.fn() }));

const read = (path: string) =>
  readFileSync(resolve(import.meta.dirname, "../..", path), "utf8");

const status = read("src/components/cards/pocket-status.ts");
const check = read("src/components/cards/page-check.tsx");
const viewer = read("src/components/cards/card-viewer.tsx");
const queueCheck = read("src/components/cards/queue-check.tsx");
const align = read("src/components/cards/page-align.tsx");

/** The code alone: a comment may quote a word, the code may not retype it. */
const code = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const found = (extra: Partial<Pocket> = {}) =>
  ({ slot: 0, state: "found", read: {}, matches: [], ...extra }) as unknown as Pocket;

describe("every pocket has a status", () => {
  it("takes the server's, and derives one for a page read before statuses", async () => {
    const { pocketStatus } = await import("@/components/cards/pocket-status");
    expect(pocketStatus(found({ status: "ambiguous", sure: true }))).toBe("ambiguous");
    expect(pocketStatus(found())).toBe("matched");
    expect(pocketStatus(found({ sure: true }))).toBe("matched");
    expect(pocketStatus(found({ sure: false }))).toBe("ambiguous");
    expect(pocketStatus({ slot: 0, state: "empty" })).toBe("empty");
    expect(pocketStatus({ slot: 0, state: "unread", read: null } as Pocket)).toBe(
      "unrecognized",
    );
  });

  it("says each in its own word and colours it with the theme's tokens", async () => {
    const { STATUS_LOOK } = await import("@/components/cards/pocket-status");
    expect(STATUS_LOOK.matched.word).toBe(rules.STATUS_MATCHED);
    expect(STATUS_LOOK.ambiguous.word).toBe(rules.STATUS_REVIEW);
    expect(STATUS_LOOK.empty.word).toBe(rules.STATUS_EMPTY);
    expect(STATUS_LOOK.unrecognized.word).toBe(rules.STATUS_UNRECOGNIZED);
    expect(STATUS_LOOK.matched.text).toBe("text-success");
    expect(STATUS_LOOK.ambiguous.text).toBe("text-warning");
    expect(STATUS_LOOK.empty.text).toBe("text-text-muted");
    expect(STATUS_LOOK.unrecognized.text).toBe("text-danger");
    for (const look of Object.values(STATUS_LOOK)) {
      expect(look.band).toMatch(/^bg-(success|warning|text-muted|danger)\/15$/);
    }
    expect(status).not.toMatch(/#[0-9a-f]{3,8}\b/i);
  });

  it("walks the review and unidentified pockets, and an unknown printing, from Check N unsure", async () => {
    const { doubtful, unsure } = await import("@/components/cards/page-check");
    expect(doubtful(found({ status: "ambiguous" }))).toBe(true);
    expect(doubtful(found({ status: "matched" }))).toBe(false);
    expect(doubtful(found({ status: "matched", printingUncertain: true }))).toBe(true);
    expect(doubtful({ slot: 0, state: "unread", read: null } as Pocket)).toBe(true);
    expect(doubtful({ slot: 0, state: "empty", status: "empty" })).toBe(false);
    /* The tile's mark and the viewer's NOT_SURE follow the status too. */
    expect(unsure(found({ status: "ambiguous", sure: true }))).toBe(true);
    expect(unsure(found({ status: "matched" }))).toBe(false);
  });
});

describe("the review grid", () => {
  it("names every pocket A1 to C3 and puts its status word in its colour under it", () => {
    expect(check).toContain("const name = POCKET_NAMES[pocket.slot];");
    expect(check).toContain("const look = STATUS_LOOK[pocketStatus(pocket)];");
    expect(check).toMatch(/look\.band,\s*\)\}/);
    expect(check).toContain(
      '<span className={cn("min-w-0 truncate", look.text)}>{look.word}</span>',
    );
    expect(check).toMatch(/<span[^>]*>\{name\}<\/span>/);
    expect(rules.POCKET_NAMES).toEqual([
      "A1",
      "A2",
      "A3",
      "B1",
      "B2",
      "B3",
      "C1",
      "C2",
      "C3",
    ]);
  });

  it("says when the page photo is blurry", () => {
    expect(check).toContain("{page.blurry && <p");
    expect(check).toContain("{BLURRY_PAGE}");
    expect(queueCheck).toContain("blurry: page.vision?.blurry ?? false,");
  });

  it("never shows the reader's confidence", () => {
    for (const source of [check, viewer, queueCheck, status]) {
      expect(code(source)).not.toContain("confidence");
    }
  });
});

describe("a pocket read again", () => {
  it("is a button in the viewer, with the accent spinner while it reads", () => {
    expect(viewer).toMatch(/\{onRescan && item\.rescan && \(\s*<Button/);
    expect(viewer).toContain("disabled={busy}");
    expect(viewer).toMatch(/<Spinner size="sm" \/>\s*\{RESCANNING_POCKET\}/);
    expect(viewer).toMatch(/<RotateCw[^>]*\/>\s*\{RESCAN_POCKET\}/);
    expect(viewer).toMatch(
      /\{item\.rescan === "failed" && \(\s*<p role="alert"[^>]*>\s*\{RESCAN_FAILED\}/,
    );
  });

  it("goes once, however often it is tapped", () => {
    expect(check).toContain("if (!onRescan || asked.current.has(key)) return;");
    const add = check.indexOf("asked.current.add(key);");
    const send = check.indexOf("await onRescan(at.id, at.slot)");
    expect(add).toBeGreaterThan(-1);
    expect(send).toBeGreaterThan(add);
  });

  it("asks the server with rescanPocketAction and puts the answer in that pocket", () => {
    expect(queueCheck).toContain("await rescanPocketAction(scanId, slot)");
    expect(queueCheck).toMatch(
      /pockets: page\.pockets\.map\(\(each\) =>\s*each\.slot === slot \? pocket : each,?\s*\)/,
    );
    expect(queueCheck).toContain("const fresh = firstChoices([pocket])[slot] ?? null;");
    expect(queueCheck).toContain("onRescan={rescan}");
  });
});

describe("the viewer on a page's pocket", () => {
  it("shows the cut-out card, glare, the reasons, and its place as A1 to C3", () => {
    expect(check).toContain("photo: page?.cellUrls[at.slot] ?? null,");
    expect(queueCheck).toContain("cellUrls: page.photos.pockets,");
    expect(viewer).toMatch(/\{item\.glare && \([\s\S]*?<Sun[\s\S]*?\{GLARE_ON_CARD\}/);
    expect(viewer).toMatch(
      /item\.reasons\.map\(\(reason, at\) => \(\s*<li key=\{at\}>\{reason\}<\/li>/,
    );
    expect(viewer).toContain("Page {page} {POCKET_NAMES[slot]}");
    expect(check).toContain("reasons: pocket.reasons,");
    expect(check).toContain("glare: pocket.glare,");
  });

  it("opens the printings under Which printing is it? when the printing is the player's call", () => {
    expect(viewer).toContain(
      "item.printingUncertain === true && (choice?.card.printings.length ?? 0) > 1;",
    );
    expect(viewer).toContain('choosePrinting ? "printing" : null,');
    expect(viewer).toMatch(/\{choosePrinting && \(\s*<p[^>]*>\{CHOOSE_PRINTING\}<\/p>/);
    expect(check).toContain("printingUncertain: pocket.printingUncertain,");
  });
});

describe("a page whose pockets could not be found", () => {
  const page = (error: string | null, photo: string | null = "url") =>
    ({
      status: "failed",
      error,
      photos: { page: photo, pockets: [] },
    }) as unknown as QueuedPage;

  it("says so, offers Line up the page, and keeps Retake for the old reasons", async () => {
    const { canLineUp, failedPageLine } =
      await import("@/components/cards/queue-check");
    expect(failedPageLine("needs-alignment")).toBe(rules.PAGE_NEEDS_LINING_UP);
    expect(failedPageLine("timeout")).toBe(rules.PAGE_TOOK_TOO_LONG);
    expect(failedPageLine("unavailable")).toBe(rules.PAGE_FAILED);
    expect(canLineUp(page("needs-alignment"))).toBe(true);
    expect(canLineUp(page("needs-alignment", null))).toBe(false);
    expect(canLineUp(page("timeout"))).toBe(false);
    expect(canLineUp(page("unavailable"))).toBe(false);
    expect(queueCheck).toContain(
      "onLineUp: canLineUp(page) ? () => setLining(page.scanId) : undefined,",
    );
    expect(check).toMatch(/onClick=\{page\.onLineUp\}>\s*\{LINE_UP_PAGE\}/);
  });

  it("starts the corners where the player or the detector left them", async () => {
    const { startCorners } = await import("@/components/cards/page-align");
    const quad = (at: number): Quad => [
      { x: at, y: at },
      { x: 1 - at, y: at },
      { x: 1 - at, y: 1 - at },
      { x: at, y: 1 - at },
    ];
    const vision = { page: quad(0.2), corners: null } as unknown as VisionView;
    expect(startCorners(vision)).toEqual(quad(0.2));
    expect(startCorners({ ...vision, corners: quad(0.3) })).toEqual(quad(0.3));
    expect(cornersMakeAPage(startCorners(null))).toBe(true);
  });

  it("turns which corner is A1, one corner clockwise each time", async () => {
    const { turnCorners } = await import("@/components/cards/page-align");
    const corners: Quad = [
      { x: 0.1, y: 0.1 },
      { x: 0.9, y: 0.1 },
      { x: 0.9, y: 0.9 },
      { x: 0.1, y: 0.9 },
    ];
    const turned = turnCorners(corners);
    expect(turned[0]).toEqual(corners[1]);
    expect(turned[3]).toEqual(corners[0]);
    /* Still clockwise, so still a page. */
    expect(cornersMakeAPage(turned)).toBe(true);
    expect(turnCorners(turnCorners(turnCorners(turned)))).toEqual(corners);
    expect(align).toMatch(
      /onClick=\{\(\) => setCorners\(turnCorners\)\}\s*>[\s\S]*?\{TURN_PAGE\}/,
    );
  });

  it("drags four handles with pointer events, A1's marked, and reads again only from a real page", () => {
    expect(align).toContain("event.currentTarget.setPointerCapture(event.pointerId);");
    expect(align).toContain("onPointerDown={(event) => down(index, event)}");
    expect(align).toContain("onPointerMove={(event) => move(index, event)}");
    expect(align).toContain("touch-none");
    expect(align).toMatch(/\{index === 0 \? \(\s*<span[^>]*>\s*\{POCKET_NAMES\[0\]\}/);
    expect(align).toContain("{LINE_UP_HINT}");
    expect(align).toContain("const valid = cornersMakeAPage(corners);");
    expect(align).toMatch(
      /disabled=\{!valid \|\| sending\} onClick=\{read\}>\s*\{READ_PAGE_AGAIN\}/,
    );
    expect(align).toContain("<Spinner");
  });

  it("sends the corners with realignPageAction and shows the page as reading again", () => {
    expect(queueCheck).toContain("await realignPageAction(scanId, corners)");
    expect(queueCheck).toContain(
      'page.scanId === scanId ? { ...page, status: "queued", error: null } : page,',
    );
    expect(queueCheck).toContain("start={startCorners(lined.vision)}");
    expect(queueCheck).toContain("photo={lined.photos.page}");
  });
});

describe("every word is scan-rules.ts", () => {
  it("never retypes a shared word", () => {
    const words = Object.entries(rules as Record<string, unknown>).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    );
    for (const [name, word] of words) {
      for (const source of [code(status), code(align), code(viewer), code(check)]) {
        expect(source, name).not.toContain(`"${word}"`);
        expect(source, name).not.toContain(`>${word}<`);
      }
    }
  });
});
