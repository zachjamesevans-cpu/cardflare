import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  PLACE_PER_PART,
  newBatchId,
  pageResize,
  placementParts,
  queueSettled,
  sendRefusalLine,
  stillSending,
} from "../../mobile/src/page-scan";
import * as app from "../../mobile/src/scan-copy";
import * as site from "@/lib/cards/scan-rules";

/**
 * Whole binder pages read in the background, in the app. The founder
 * (2026-10-09): "the full binder page scans should be fully agentic...
 * Maybe it scans it, and then they'll get a notification once it's
 * ready." Pages are SENT from the camera and read on the server; the
 * binder says when they are ready; the check is the same grid with the
 * player's photos from the server; a notice opens it.
 *
 * Read off the source where it has to be: the app has no renderer in the
 * test run. The requests run for real, against a stubbed fetch, when the
 * app's packages are installed.
 */

vi.mock("../../mobile/node_modules/expo-secure-store", () => ({
  getItemAsync: vi.fn(async () => null),
  setItemAsync: vi.fn(async () => {}),
  deleteItemAsync: vi.fn(async () => {}),
}));
vi.mock("../../mobile/node_modules/expo-constants", () => ({
  default: { expoConfig: { extra: {} } },
}));
vi.mock("../../mobile/node_modules/@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: async () => null,
    setItem: async () => {},
    removeItem: async () => {},
    getAllKeys: async () => [],
    multiRemove: async () => {},
  },
}));

const read = (path: string) =>
  readFileSync(resolve(import.meta.dirname, "../..", path), "utf8");
const flat = (text: string) => text.replace(/\s+/g, " ");
const code = (text: string) =>
  text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const src = {
  pages: read("mobile/src/page-scanner.tsx"),
  sheet: read("mobile/src/binder-add-sheet.tsx"),
  binder: read("mobile/src/screens/binder.tsx"),
  follow: read("mobile/src/follow-href.ts"),
  stack: read("mobile/App.tsx"),
  inbox: read("mobile/src/screens/inbox.tsx"),
  api: read("mobile/src/api.ts"),
  scanner: read("mobile/src/card-scanner.tsx"),
};

/** The shooting step alone, and the check alone. */
const shooting = src.pages.slice(
  src.pages.indexOf("export function PageScanner("),
  src.pages.indexOf("export function PageCheckSheet("),
);
const checking = src.pages.slice(
  src.pages.indexOf("function PageCheck("),
  src.pages.indexOf("function PocketTile("),
);

describe("the words", () => {
  it("mirror every new export of scan-rules, word for word", () => {
    for (const name of [
      "SENDING_PAGE",
      "PAGE_SENT",
      "READING_IN_BACKGROUND",
      "CHECK_NOW",
      "THROW_PAGES_AWAY",
      "NOT_SURE",
      "PAGE_TOOK_TOO_LONG",
      "QUEUE_FULL",
      "DONE_SCANNING",
      "PAGES_PER_DAY",
    ] as const) {
      expect(app[name], name).toBe(site[name]);
    }
    expect(app.SCAN_REFUSALS["daily-pages"]).toBe(site.SCAN_REFUSALS["daily-pages"]);
    for (const [pages, ready] of [
      [1, false],
      [5, false],
      [1, true],
      [5, true],
    ] as const) {
      expect(app.pagesWaitingLine(pages, ready)).toBe(
        site.pagesWaitingLine(pages, ready),
      );
    }
    for (const left of [0, 1, 18, 20]) {
      expect(app.pagesLeftLine(left)).toBe(site.pagesLeftLine(left));
    }
  });

  it("are never typed in again on the screens", () => {
    for (const [name, text] of [
      ["pages", code(src.pages)],
      ["binder", code(src.binder)],
      ["scanner", code(src.scanner)],
    ] as const) {
      for (const value of [
        site.SENDING_PAGE,
        site.PAGE_SENT,
        site.READING_IN_BACKGROUND,
        site.CHECK_NOW,
        site.THROW_PAGES_AWAY,
        site.NOT_SURE,
        site.PAGE_TOOK_TOO_LONG,
        site.QUEUE_FULL,
        site.SCAN_REFUSALS["daily-pages"],
        "ready to check",
        "pages left today",
      ]) {
        expect(text, `${name}: ${value}`).not.toContain(`"${value}`);
      }
    }
  });

  it("say a refused send in the scanner's words, else the queue's", () => {
    expect(sendRefusalLine("daily-pages")).toBe(site.SCAN_REFUSALS["daily-pages"]);
    expect(sendRefusalLine("too-big")).toBe(site.SCAN_REFUSALS["too-big"]);
    expect(sendRefusalLine("not-allowed")).toBe(site.SCAN_REFUSALS["not-allowed"]);
    expect(sendRefusalLine("queue-full")).toBe(site.QUEUE_FULL);
    expect(sendRefusalLine("not-yours")).toBe(site.SCAN_REFUSALS.unavailable);
  });
});

describe("the shooting step sends, and never waits for a read", () => {
  it("sends each page to be read on the server, one at a time", () => {
    expect(shooting).toContain("void sendPage(binderId, batchId, page)");
    expect(src.pages).toContain("const result = await sendScanPage({");
    expect(src.pages).toContain("pageNumber: page.number,");
    expect(src.pages).not.toMatch(/scanPagePhotos|read-page/);
    expect(src.api).not.toMatch(/scanPagePhotos|read-page/);
    /* Nothing in the shooting step asks for a read page. */
    expect(shooting).not.toContain("getPageQueue(");
    expect(shooting).not.toContain("READING_PAGE");
  });

  it("sends the whole page beside its nine pockets, cut to the guide", () => {
    expect(src.pages).toContain("cutJpeg(photo.uri, region, pageResize(region))");
    expect(pageResize({ width: 3000, height: 4200 })).toEqual({ height: 1568 });
    expect(pageResize({ width: 4200, height: 3000 })).toEqual({ width: 1568 });
    expect(pageResize({ width: 900, height: 1260 })).toEqual({ height: 1260 });
    /* Under the same ceiling as a pocket. */
    expect(src.pages).toContain("(out.base64.length * 3) / 4 <= SCAN_MAX_BYTES");
  });

  it("makes the queue's id once, and sends every page under it", () => {
    expect(shooting).toContain(
      "const [batchId] = useState(() => retake?.batchId ?? newBatchId());",
    );
    expect(shooting.match(/newBatchId\(/g)).toHaveLength(1);
    const uuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
    expect(newBatchId()).toMatch(uuid);
    expect(newBatchId()).not.toBe(newBatchId());
    /* And by hand, on a phone with no randomUUID. */
    vi.stubGlobal("crypto", undefined);
    try {
      expect(newBatchId()).toMatch(uuid);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("says Sending..., then Sent, or the refusal with Retake", () => {
    const row = src.pages.slice(src.pages.indexOf("function rowLine("));
    expect(row.slice(0, 300)).toContain(
      'return page.status === "sent" ? PAGE_SENT : SENDING_PAGE;',
    );
    expect(row.slice(0, 300)).toContain(
      'if (page.status === "refused") return page.failure',
    );
    expect(src.pages).toContain("failure: sendRefusalLine(result.reason),");
    expect(shooting).toContain('{page.status === "refused" && !finishing ? (');
    expect(shooting).toContain("{`Page ${page.number}`}");
    expect(shooting).toContain("<Text style={styles.action}>{RETAKE}</Text>");
  });

  it("counts the day under the shutter, and gives way to the refusal at none", () => {
    expect(shooting).toContain("{pagesLeftLine(leftNow)}");
    expect(shooting).toContain('{SCAN_REFUSALS["daily-pages"]}');
    const out = shooting.indexOf("{outForToday ? (");
    expect(out).toBeGreaterThan(-1);
    expect(shooting.indexOf('{SCAN_REFUSALS["daily-pages"]}')).toBeGreaterThan(out);
    expect(shooting.indexOf("label={takePageLabel(nextNumber)}")).toBeGreaterThan(
      shooting.indexOf('{SCAN_REFUSALS["daily-pages"]}'),
    );
    expect(shooting).toContain("const outForToday = !retake && leftNow === 0;");
    expect(src.pages).toContain("void getPageQueues(binderId)");
  });

  it("once a page has gone, says it is read in the background, and Done closes after the sends", () => {
    const sent = shooting.slice(shooting.indexOf("{anySent ? ("));
    expect(sent).toContain("{READING_IN_BACKGROUND}");
    expect(sent).toContain("label={DONE_SCANNING}");
    expect(sent.indexOf("{READING_IN_BACKGROUND}")).toBeLessThan(
      sent.indexOf("label={DONE_SCANNING}"),
    );
    expect(shooting).toContain(
      'const anySent = queue.some((page) => page.status === "sent");',
    );
    /* Done waits for the sends in flight, and for nothing else. */
    expect(shooting).toContain(
      "if (!finishing || stillSending(queue) || done.current) return;",
    );
    expect(stillSending([{ status: "sent" }, { status: "refused" }])).toBe(false);
    expect(stillSending([{ status: "sent" }, { status: "sending" }])).toBe(true);
    expect(stillSending([{ status: "waiting" }])).toBe(true);
    /* And the menu closes into the binder's banner. */
    expect(src.sheet).toContain("onDone={pagesSent}");
    expect(src.binder).toContain("onPagesSent={() => {");
  });
});

describe("the binder's banner", () => {
  it("is the owner's, one per waiting queue, above the pockets", () => {
    const banner = src.binder.indexOf("queues.map((queue) => (");
    expect(banner).toBeGreaterThan(-1);
    expect(
      src.binder.indexOf("<GestureDetector gesture={drag.gesture}>"),
    ).toBeGreaterThan(banner);
    expect(src.binder.slice(banner - 200, banner)).toContain("{yours");
    expect(src.binder).toContain("{pagesWaitingLine(queue.pages, queue.ready)}");
    expect(src.binder).toContain("const answer = await getPageQueues(writeId);");
  });

  it("offers Check now only once the pages are ready", () => {
    const banner = src.binder.slice(src.binder.indexOf("queues.map((queue) => ("));
    const ready = banner.indexOf("{queue.ready ? (");
    expect(ready).toBeGreaterThan(-1);
    expect(banner.indexOf("{CHECK_NOW}")).toBeGreaterThan(ready);
    expect(banner).toContain("setChecking(queue.batchId);");
  });

  it("asks again every 15 s while pages are being read and the screen is in front, and on focus", () => {
    expect(src.binder).toContain("const QUEUE_POLL_MS = 15_000;");
    const poll = src.binder.slice(
      src.binder.indexOf("const stillReading ="),
      src.binder.indexOf("const stillReading =") + 500,
    );
    expect(poll).toContain("useFocusEffect(");
    expect(poll).toContain("if (!stillReading) return;");
    expect(poll).toContain(
      'if (AppState.currentState === "active") void loadQueues();',
    );
    expect(poll).toContain("return () => clearInterval(timer);");
    expect(flat(src.binder)).toContain(
      "useFocusEffect( useCallback(() => { void loadQueues(); }, [loadQueues]), );",
    );
  });
});

describe("the check", () => {
  it("loads queueView for its queue, and asks again every 10 s until every page is done", () => {
    expect(checking).toContain("const queue = await getPageQueue(batchId);");
    expect(src.api).toContain("`${PAGES_PATH}?batch=${encodeURIComponent(batchId)}`");
    expect(src.pages).toContain("const CHECK_POLL_MS = 10_000;");
    expect(checking).toContain(
      "const settled = pages !== null && queueSettled(pages);",
    );
    expect(checking).toContain(
      "const timer = setTimeout(() => void load(), CHECK_POLL_MS);",
    );
    expect(queueSettled([{ status: "ready" }, { status: "failed" }])).toBe(true);
    expect(queueSettled([{ status: "ready" }, { status: "reading" }])).toBe(false);
    expect(queueSettled([{ status: "queued" }])).toBe(false);
  });

  it("draws a read page with the player's photos from the server's links", () => {
    expect(checking).toContain("photo={page.photos.pockets[pocket.slot] ?? null}");
    expect(checking).toContain("photo={page.photos.pockets[openSlot] ?? null}");
    expect(checking).toContain('{page.status === "ready" ? (');
    expect(src.pages).not.toContain("cells[pocket.slot]");
  });

  it("marks a guess the reader was not sure of, and shows its note", () => {
    const tile = src.pages.slice(src.pages.indexOf("function PocketTile("));
    expect(tile).toContain(
      'const unsure = pocket.state === "found" && pocket.sure === false;',
    );
    expect(tile).toContain("{unsure ? (");
    const detail = src.pages.slice(src.pages.indexOf("function PocketDetail("));
    expect(detail).toContain("{NOT_SURE}");
    /* The note under the guess, and under an unread pocket's line. */
    const guess = detail.indexOf(
      "<Text style={styles.number}>{pick.hit.cardNumber}</Text>",
    );
    const note = detail.indexOf('{pocket.state === "found" && note ? (');
    expect(note).toBeGreaterThan(guess);
    expect(detail).toContain('{pocket.state === "unread" && note ? (');
    expect(src.api).toMatch(
      /state: "found";[\s\S]*?sure\?: boolean;[\s\S]*?note\?: string;/,
    );
  });

  it("offers Retake on a failed page, into the same queue under the same number", () => {
    expect(checking).toContain(
      '{page.error === "timeout" ? PAGE_TOOK_TOO_LONG : PAGE_FAILED}',
    );
    expect(checking).toContain("setRetaking(number);");
    expect(checking).toContain("retake={{ batchId, page: retaking }}");
    expect(shooting).toContain(
      "const [start, setStart] = useState(() => retake?.page ?? firstEmptyPage(occupied));",
    );
  });

  it("says a page is being read with the accent spinner", () => {
    const reading = checking.slice(checking.indexOf("<ActivityIndicator"));
    expect(reading.slice(0, 200)).toContain('size="small" color={colors.accent}');
    expect(reading.slice(0, 200)).toContain("{READING_PAGE}");
  });

  it("places each page on its own number, waiting for every page to be done", () => {
    expect(checking).toContain("page: page.page,");
    expect(checking).toContain("const placements = pagePlacements(choices);");
    expect(checking).toContain(
      "const result = await placePageQueue(batchId, placements);",
    );
    expect(checking).toContain("disabled={chosenPages === 0 || !settled}");
    expect(checking).toContain("if (alive.current) onPlaced(result.message);");
    /* The binder shows the sentence and reads itself again. */
    const placed = src.binder.slice(src.binder.indexOf("onPlaced={(message) => {"));
    expect(placed.slice(0, 300)).toContain("setNotice(message);");
    expect(placed.slice(0, 300)).toContain("void load();");
    expect(placed.slice(0, 300)).toContain("setChecking(null);");
  });

  it("throws the pages away only after asking", () => {
    const away = checking.slice(checking.indexOf("const throwAway = () =>"));
    expect(away).toContain("Alert.alert(`${THROW_PAGES_AWAY}?`");
    expect(away.indexOf("void discardPageQueue(batchId)")).toBeGreaterThan(
      away.indexOf('style: "destructive"'),
    );
    expect(checking).toContain("label={THROW_PAGES_AWAY}");
    expect(checking).toContain('variant="secondary"');
  });
});

describe("placing a long queue", () => {
  it("goes in parts of at most 27, last only on the final part", () => {
    expect(PLACE_PER_PART).toBe(27);
    const ninety = Array.from({ length: 90 }, (_, at) => at);
    const parts = placementParts(ninety);
    expect(parts.map((part) => part.placements.length)).toEqual([27, 27, 27, 9]);
    expect(parts.map((part) => part.last)).toEqual([false, false, false, true]);
    expect(parts.flatMap((part) => part.placements)).toEqual(ninety);
    expect(placementParts([1, 2])).toEqual([{ placements: [1, 2], last: true }]);
    expect(placementParts(Array.from({ length: 27 }, () => 0))).toHaveLength(1);
    expect(placementParts([])).toEqual([]);
    expect(src.api).toContain("for (const part of placementParts(placements)) {");
    expect(src.api).toContain("return { message: pagesPlacedLine(totals) };");
  });
});

describe("the notice's link", () => {
  it("routes /profile/binders/<id>?scan=<batch> to the Binder screen with the queue", () => {
    const route = src.follow.slice(
      src.follow.indexOf('href.startsWith("/profile/binders/")'),
    );
    expect(route).toContain(
      'const binderId = segmentAfter(href, "/profile/binders/");',
    );
    expect(route).toContain('const scan = queryValue(href, "scan");');
    expect(route).toContain(
      'navigation.navigate("Binder", scan ? { binderId, scan } : { binderId });',
    );
    /* Before /profile, which it would otherwise never reach. */
    expect(src.follow.indexOf('href.startsWith("/profile/binders/")')).toBeLessThan(
      src.follow.indexOf('href === "/profile"'),
    );
    expect(src.stack).toContain("scan?: string }");
    expect(src.stack).toContain("scan={route.params?.scan}");
  });

  it("opens the check on the Binder screen, once", () => {
    const open = src.binder.slice(src.binder.indexOf("if (!scan || !mine) return;"));
    expect(open.slice(0, 200)).toContain("setChecking(scan);");
    expect(open.slice(0, 200)).toContain("navigation.setParams({ scan: undefined });");
    expect(src.binder).toContain("<PageCheckSheet");
    expect(src.binder).toContain("batchId={checking}");
  });

  it("has its own mark in the inbox", () => {
    expect(flat(src.inbox)).toContain(
      'item.kind === "pages-ready" ? "scan-outline" : kindIcon(item.kind) === "store"',
    );
  });
});

/* ---- The requests, run for real against a stubbed fetch ------------ */

interface AppApi {
  sendScanPage: (input: {
    binderId: string;
    batchId: string;
    pageNumber: number;
    page: string;
    pockets: (string | null)[];
  }) => Promise<unknown>;
  getPageQueue: (batchId: string) => Promise<unknown>;
  placePageQueue: (
    batchId: string,
    placements: { pocket: number; cardId: string; printingId: string | null }[],
  ) => Promise<{ message: string }>;
}
const API_PATH = "../../mobile/src/api";
const loadApi = () => import(/* @vite-ignore */ API_PATH) as Promise<AppApi>;
const appInstalled = existsSync(
  resolve(import.meta.dirname, "../../mobile/node_modules/expo-secure-store"),
);

describe.skipIf(!appInstalled)(
  "the queue's requests (needs mobile/node_modules)",
  () => {
    type Sent = {
      url: string;
      method: string;
      payload: Record<string, unknown> | null;
    };
    let sent: Sent[];
    let answer: (one: Sent) => Response;

    const reply = (body: unknown, status = 200) =>
      new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      });

    beforeEach(() => {
      vi.resetModules();
      sent = [];
      vi.stubGlobal(
        "fetch",
        vi.fn(async (url: string, init: RequestInit) => {
          const headers = init.headers as Record<string, string>;
          const header = headers["x-cf-payload"];
          const text = header
            ? decodeURIComponent(header)
            : (init.body as string | undefined);
          const one = {
            url: new URL(url).pathname + new URL(url).search,
            method: init.method ?? "GET",
            payload: text ? (JSON.parse(text) as Record<string, unknown>) : null,
          };
          sent.push(one);
          return answer(one);
        }),
      );
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    const BATCH = "00000000-0000-4000-8000-0000000000b2";

    it("places 40 cards in parts of 27, last on the final part, the counts added up", async () => {
      answer = (one) =>
        reply({
          message: "ignored",
          counts: {
            added: (one.payload?.placements as unknown[]).length,
            merged: 1,
            occupied: 0,
            skipped: 0,
          },
        });
      const api = await loadApi();
      const placements = Array.from({ length: 40 }, (_, pocket) => ({
        pocket,
        cardId: "00000000-0000-4000-8000-00000000000c",
        printingId: null,
      }));
      const result = await api.placePageQueue(BATCH, placements);
      const places = sent.filter((one) => one.payload?.action === "place");
      expect(
        places.map((one) => (one.payload?.placements as unknown[]).length),
      ).toEqual([27, 13]);
      expect(places.map((one) => one.payload?.last)).toEqual([false, true]);
      expect(places.every((one) => one.url === "/api/v1/scans/pages")).toBe(true);
      expect(result.message).toBe(
        site.pagesPlacedLine({ added: 40, merged: 2, occupied: 0, skipped: 0 }),
      );
    });

    it("hears a refused send as a reason, not an error", async () => {
      answer = (one) =>
        one.payload?.action === "probe"
          ? reply({ ok: true })
          : reply({ ok: false, reason: "daily-pages" }, 429);
      const api = await loadApi();
      await expect(
        api.sendScanPage({
          binderId: "00000000-0000-4000-8000-0000000000b1",
          batchId: BATCH,
          pageNumber: 3,
          page: "UEFHRQ",
          pockets: Array.from({ length: 9 }, () => null),
        }),
      ).resolves.toEqual({ ok: false, reason: "daily-pages" });
    });

    it("reads a queue that is gone as nothing to check", async () => {
      answer = () => reply({ error: "not-found" }, 404);
      const api = await loadApi();
      await expect(api.getPageQueue(BATCH)).resolves.toBeNull();
      expect(sent[0].url).toBe(`/api/v1/scans/pages?batch=${BATCH}`);
      expect(sent[0].method).toBe("GET");
    });
  },
);
