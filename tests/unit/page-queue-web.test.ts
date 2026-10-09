import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

import type { Choice, Pocket } from "@/components/cards/page-check";
import type { QueuedPage } from "@/lib/cards/page-jobs";
import * as rules from "@/lib/cards/scan-rules";
import type { CardResult } from "@/lib/cards/schema";

/**
 * Whole binder pages read in the background, on the website. The
 * founder (2026-10-09): "the full binder page scans should be fully
 * agentic... Maybe it scans it, and then they'll get a notification
 * once it's ready." The shoot step sends and never waits for a read;
 * the binder shows a banner per queue; the check opens from the banner
 * or the notice's link and draws the server's queue. The app's twin is
 * page-queue-app.test.ts; the words are scan-rules.ts.
 */

/* The components import Server Actions; the tests never call them. */
vi.mock("@/lib/cards/page-job-actions", () => ({
  sendPageAction: vi.fn(),
  queuesForAction: vi.fn(),
  queueViewAction: vi.fn(),
  placeQueueAction: vi.fn(),
  discardQueueAction: vi.fn(),
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

const shoot = read("src/components/cards/page-scan.tsx");
const scanner = read("src/components/cards/scanner.tsx");
const viewer = read("src/components/cards/card-viewer.tsx");
const check = read("src/components/cards/page-check.tsx");
const queueCheck = read("src/components/cards/queue-check.tsx");
const banner = read("src/components/binder/page-queues.tsx");
const view = read("src/components/binder/binder-page.tsx");
const add = read("src/components/binder/add-binder-card.tsx");
const ownPage = read("src/app/profile/binders/[binderId]/page.tsx");
const inbox = read("src/components/inbox/inbox-list.tsx");
const notify = read("src/lib/notifications/notify.ts");

/** The code alone: a comment may quote a word, the code may not retype it. */
const code = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const card = (id: string) => ({ id, printings: [] }) as unknown as CardResult;
const chose = (id: string, printingId: string | null = null): Choice => ({
  card: card(id),
  printingId,
});
const empty = (): Choice[] => Array.from({ length: 9 }, () => null);

describe("the shoot step sends pages and never waits for a read", () => {
  it("sends with sendPageAction, never the quick reader, and never looks at the queue", () => {
    expect(shoot).toContain(
      'import { sendPageAction } from "@/lib/cards/page-job-actions";',
    );
    expect(shoot).not.toContain("scanPageAction");
    expect(shoot).not.toContain("queueViewAction");
    expect(shoot).not.toContain("<PageCheck");
    expect(shoot).not.toContain("placeBinderPagesAction");
    expect(shoot).not.toContain("placeQueueAction");
  });

  it("makes the queue's batchId once, and sends every page with it", () => {
    expect(scanner).toContain(
      "const [batchId] = useState(() => retake?.batchId ?? crypto.randomUUID());",
    );
    expect(scanner.match(/crypto\.randomUUID\(\)/g)).toHaveLength(1);
    expect(shoot).not.toContain("crypto.randomUUID()");
    expect(shoot).toContain('form.append("batchId", batchId);');
    expect(shoot).toContain('form.append("binderId", binderId);');
    expect(shoot).toContain('form.append("pageNumber", String(pageNumber));');
  });

  it("says Sending..., then Page 4 added, and a refusal in its own sentence", () => {
    expect(scanner).toMatch(/\{inFlight > 0 && \([\s\S]*?\{SENDING_PAGE\}/);
    expect(scanner).toContain("pageAddedLine(number)");
    expect(scanner).toContain("sendRefusalLine(outcome.reason)");
  });

  it("closes on Done only when nothing is on its way, and says the pages are read", () => {
    expect(scanner).toMatch(/onClick=\{\(\) => setFinishing\(true\)\}/);
    expect(scanner).toContain("{DONE_SCANNING}");
    expect(scanner).toContain(
      "if (!finishing || inFlight > 0 || closed.current) return;",
    );
    expect(scanner).toContain("onDone(sent > 0);");
    expect(add).toContain("if (sentPages) setPagesWent(true);");
    expect(add).toMatch(
      /\{pagesWent && \(\s*<p[^>]*>\s*\{READING_IN_BACKGROUND\}\s*<\/p>/,
    );
  });

  it("shows the pages left once a page is sent, and the day's refusal at 0", () => {
    expect(scanner).toContain("{pagesLeftLine(leftNow)}");
    expect(scanner).toContain(
      'const leftNow = typeof left === "number" ? Math.max(0, left - inFlight) : left;',
    );
    expect(scanner).toMatch(
      /if \(leftNow === 0\) \{\s*setStep\(\{ kind: "refused", line: SCAN_REFUSALS\["daily-pages"\] \}\);/,
    );
    expect(add).toContain("left={pagesLeft}");
    expect(view).toContain("pagesLeft={queues.known ? queues.left : undefined}");
  });
});

describe("the binder's banner", () => {
  it("sits over the pockets, one per waiting queue, on your own binder", () => {
    const at = view.indexOf(
      "{binder.yours && <QueueBanners queues={queues.queues} onCheck={setChecking} />}",
    );
    const grid = view.indexOf('<div className="cfa-bg-binder-page');
    expect(at).toBeGreaterThan(-1);
    expect(grid).toBeGreaterThan(at);
    expect(view).toContain(
      "const queues = usePageQueues(binder.id, binder.yours, pageQueues);",
    );
  });

  it("says the queue's line, with Check now only once it is ready", () => {
    expect(banner).toContain("{pagesWaitingLine(queue.pages, queue.ready)}");
    expect(banner).toMatch(
      /\{queue\.ready && \(\s*<Button[^>]*onClick=\{\(\) => onCheck\(queue\.batchId\)\}>\s*\{CHECK_NOW\}/,
    );
  });

  it("looks again every 15 s while a page is read and the tab is in view, and on focus", async () => {
    const { QUEUE_POLL_MS } = await import("@/components/binder/page-queues");
    expect(QUEUE_POLL_MS).toBe(15_000);
    expect(banner).toContain(
      "const timer = reading ? window.setInterval(look, QUEUE_POLL_MS) : null;",
    );
    expect(banner).toContain('if (document.visibilityState === "visible") refresh();');
    expect(banner).toContain('window.addEventListener("focus", look);');
    expect(banner).toContain('document.addEventListener("visibilitychange", look);');
    expect(banner).toContain("queuesForAction(binderId)");
  });

  it("reads the queues when the sheet closes, so a page just sent shows at once", () => {
    expect(view).toMatch(
      /setAdding\(null\);\s*(\/\*[^*]*\*\/\s*)?queues\.refresh\(\);/,
    );
  });
});

describe("the check is the server's queue", () => {
  it("loads queueView, and looks again every 10 s while a page is still read", async () => {
    const { CHECK_POLL_MS, stillReading } =
      await import("@/components/cards/queue-check");
    expect(CHECK_POLL_MS).toBe(10_000);
    expect(queueCheck).toContain("await queueViewAction(batchId)");
    expect(queueCheck).toContain("if (pages !== null && !waiting) return;");
    expect(stillReading({ status: "queued" })).toBe(true);
    expect(stillReading({ status: "reading" })).toBe(true);
    expect(stillReading({ status: "ready" })).toBe(false);
    expect(stillReading({ status: "failed" })).toBe(false);
  });

  it("draws the player's photos from the server's links, not local pictures", () => {
    expect(queueCheck).toContain("cellUrls: page.photos.pockets,");
    expect(queueCheck).not.toContain("createObjectURL");
    expect(check).toContain("cellUrls: readonly (string | null)[];");
  });

  it("keeps a read page as it first came, so its pictures do not reload", async () => {
    const { mergePages } = await import("@/components/cards/queue-check");
    const page = (scanId: string, status: QueuedPage["status"], url: string) =>
      ({
        scanId,
        page: 1,
        status,
        error: null,
        pockets: status === "ready" ? [] : null,
        photos: { page: url, pockets: [] },
      }) as QueuedPage;
    const before = [page("a", "ready", "first"), page("b", "reading", "first")];
    const after = [page("a", "ready", "second"), page("b", "ready", "second")];
    const merged = mergePages(before, after);
    expect(merged[0]?.photos.page).toBe("first");
    expect(merged[1]?.photos.page).toBe("second");
    expect(merged[1]?.status).toBe("ready");
  });

  it("says Reading... with the spinner on a page still with the reader", () => {
    expect(queueCheck).toContain(
      "line: stillReading(page) ? READING_PAGE : failedPageLine(page.error),",
    );
    expect(check).toContain('{page.reading && <Spinner size="sm" />}');
  });

  it("starts each pocket on the best guess, and nothing where there was none", async () => {
    const { firstChoices } = await import("@/components/cards/queue-check");
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
    expect(choices.slice(1).every((choice) => choice === null)).toBe(true);
  });
});

describe("a guess the reader was not sure of", () => {
  it("is a found pocket with sure === false, and nothing else", async () => {
    const { unsure } = await import("@/components/cards/page-check");
    const found = (sure?: boolean) =>
      ({ slot: 0, state: "found", read: {}, matches: [], sure }) as unknown as Pocket;
    expect(unsure(found(false))).toBe(true);
    expect(unsure(found(true))).toBe(false);
    expect(unsure(found(undefined))).toBe(false);
    expect(unsure({ slot: 0, state: "empty" })).toBe(false);
  });

  it("wears a mark on its tile, and the viewer says NOT_SURE and the note", () => {
    expect(check).toMatch(/\{unsure\(pocket\) && \(\s*<span[^>]*>\s*<CircleHelp/);
    expect(viewer).toMatch(
      /\{unsure && \(\s*<div[^>]*>\s*<p[^>]*>\s*<CircleHelp[\s\S]*?\{NOT_SURE\}\s*<\/p>\s*\{item\.note && /,
    );
    /* Sure, or a quick read: the note under the match. */
    expect(viewer).toContain("{!unsure && item.note && (");
    expect(check).toContain(
      'sure: pocket.state === "found" ? pocket.sure : undefined,',
    );
    expect(check).toContain(
      'note: pocket.state === "empty" ? undefined : pocket.note,',
    );
  });

  it("on a single scan, says NOT_SURE and the note the same way, in the same viewer", () => {
    expect(scanner).toContain("<CardViewer");
    expect(scanner).toContain("sure: answer.sure,");
    expect(scanner).toContain("note: answer.note,");
  });
});

describe("a page that did not read is retaken into the same queue", () => {
  it("says why: too long, or not read", async () => {
    const { failedPageLine } = await import("@/components/cards/queue-check");
    expect(failedPageLine("timeout")).toBe(rules.PAGE_TOOK_TOO_LONG);
    expect(failedPageLine("unavailable")).toBe(rules.PAGE_FAILED);
    expect(failedPageLine(null)).toBe(rules.PAGE_FAILED);
  });

  it("offers Retake, which opens the scanner for that page with the queue's batchId", () => {
    expect(queueCheck).toContain(
      'page.status === "failed" && onRetake ? () => onRetake(page.page) : undefined,',
    );
    expect(check).toMatch(/onClick=\{page\.onRetake\}\s*>\s*\{RETAKE\}/);
    expect(view).toContain("setAdding({ pocket: null, retake: { batchId, page } });");
    expect(view).toContain("retake={adding?.retake ?? null}");
    expect(add).toContain("retake={retake}");
    expect(add).toContain("setScanning(Boolean(retake));");
    expect(scanner).toContain("() => retake?.page ?? firstEmptyPage(pockets),");
    /* The photo is that page: it goes as one, without the single read. */
    expect(scanner).toMatch(/if \(retake\) \{\s*await sendAsPage\(file\);/);
    /* Only when the camera is the player's: never a Retake that cannot work. */
    expect(view).toMatch(/onRetake=\{\s*scanRights\?\.pages === "on" && checking/);
  });
});

describe("placing", () => {
  it("puts each chosen card at pocketAt(the page's own number, slot)", async () => {
    const { pagePlacements, pagesChosen } =
      await import("@/components/cards/queue-check");
    const first = empty();
    first[0] = chose("a", "p");
    first[8] = chose("b");
    const later = empty();
    later[4] = chose("c");
    /* Pages 4 and 9, with page 6 still unread: numbers, not places in a list. */
    const pages = [
      { page: 4, choices: first },
      { page: 6, choices: null },
      { page: 9, choices: later },
    ];
    expect(pagePlacements(pages)).toEqual([
      { pocket: rules.pocketAt(4, 0), cardId: "a", printingId: "p" },
      { pocket: rules.pocketAt(4, 8), cardId: "b", printingId: null },
      { pocket: rules.pocketAt(9, 4), cardId: "c", printingId: null },
    ]);
    expect(pagesChosen(pages.map((page) => page.choices))).toBe(2);
    expect(queueCheck).not.toContain("startPage");
  });

  it("places with placeQueueAction from the Add button, then the binder redraws", () => {
    expect(queueCheck).toContain(
      "const result = await placeQueueAction(batchId, { placements });",
    );
    expect(queueCheck).toMatch(/onClick=\{place\}\s*>\s*\{addPagesLabel\(chosen\)\}/);
    expect(view).toMatch(/closeCheck\(\);\s*router\.refresh\(\);/);
  });

  it("throws the pages away only after asking, with discardQueueAction", () => {
    expect(queueCheck).toContain(
      "if (!window.confirm(`${THROW_PAGES_AWAY}?`)) return;",
    );
    expect(queueCheck).toContain("await discardQueueAction(batchId)");
    expect(queueCheck).toMatch(
      /variant="secondary"[\s\S]*?onClick=\{throwAway\}\s*>\s*\{THROW_PAGES_AWAY\}/,
    );
  });
});

describe("the notice's link opens the check", () => {
  it("is /profile/binders/<id>?scan=<batch>, read by the page and handed down", () => {
    expect(notify).toContain(
      "const path = `/profile/binders/${entry.binderId}?scan=${entry.batchId}`;",
    );
    expect(ownPage).toContain("searchParams: Promise<{ scan?: string | string[] }>;");
    expect(ownPage).toContain(
      'const openScan = typeof scan === "string" && QUEUE_ID.test(scan) ? scan : null;',
    );
    expect(ownPage).toContain("openScan={openScan}");
    expect(view).toMatch(
      /const \[checking, setChecking\] = useState<string \| null>\(\s*binder\.yours \? openScan : null,\s*\);/,
    );
    expect(view).toContain("batchId={checking}");
  });

  it("survives signing in on the way", () => {
    expect(ownPage).toContain(
      'const here = `/profile/binders/${binderId}${openScan ? `?scan=${openScan}` : ""}`;',
    );
  });
});

describe("the inbox row for pages ready", () => {
  it("leads with the scanner", () => {
    expect(inbox).toContain('import { Bell, ScanLine, Store } from "lucide-react";');
    expect(inbox).toMatch(/item\.kind === "pages-ready" \? \(\s*<ScanLine/);
  });
});

describe("every word is scan-rules.ts", () => {
  it("never retypes a shared word", () => {
    const words = Object.entries(rules as Record<string, unknown>).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    );
    for (const [name, word] of words) {
      for (const source of [code(shoot), code(check), code(queueCheck), code(banner)]) {
        expect(source, name).not.toContain(`"${word}"`);
        expect(source, name).not.toContain(`>${word}<`);
      }
    }
    for (const source of [code(shoot), code(queueCheck), code(banner)]) {
      for (const word of Object.values(rules.SCAN_REFUSALS)) {
        expect(source).not.toContain(word);
      }
      expect(source).not.toMatch(/ready to check|pages left today|`Reading \$\{/);
    }
  });
});
