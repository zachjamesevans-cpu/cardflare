import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  canTakeAnother,
  nextToSend,
  pagePlacements,
  pagesWithCards,
  pocketBox,
  pocketInPhoto,
} from "../../mobile/src/page-scan";
import * as app from "../../mobile/src/scan-copy";
import { CARD_ASPECT, guideFrame, scanResize } from "../../mobile/src/scan-frame";
import * as site from "@/lib/cards/scan-rules";

/**
 * Whole binder pages in the app. The founder (2026-10-09): "scan, let's
 * say 5 pages of their binder into a queue and it auto fills in an
 * actual binder, with the exact same location the cards were in in
 * their binder", and the single scan kept "fast and quick". The app's
 * page scanner is the website's: the same words, the same steps, the
 * same cuts, and a faster upload with the old pieces as its fallback.
 * Pages read in the background, and their check from the binder, are
 * pinned in page-queue-app.test.ts.
 *
 * Read off the source where it has to be: the app has no renderer in
 * the test run. The upload rule runs for real, against a stubbed fetch.
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

const src = {
  sheet: read("mobile/src/binder-add-sheet.tsx"),
  pages: read("mobile/src/page-scanner.tsx"),
  scanner: read("mobile/src/card-scanner.tsx"),
  viewer: read("mobile/src/card-viewer.tsx"),
  api: read("mobile/src/api.ts"),
};

describe("the words and the rules", () => {
  it("are the website's whole-pages block, line for line", () => {
    const block = (text: string) => text.slice(text.indexOf("/* ---- Whole pages"));
    const siteBlock = block(read("src/lib/cards/scan-rules.ts"));
    expect(siteBlock.length).toBeGreaterThan(1000);
    expect(block(read("mobile/src/scan-copy.ts"))).toBe(siteBlock);
  });

  it("answer the same, every function", () => {
    expect(app.POCKETS_PER_PAGE).toBe(site.POCKETS_PER_PAGE);
    expect(app.BINDER_PAGES).toBe(site.BINDER_PAGES);
    expect(app.MAX_SCAN_PAGES).toBe(site.MAX_SCAN_PAGES);
    expect(app.POCKET_MARGIN).toBe(site.POCKET_MARGIN);
    for (const [page, slot] of [
      [1, 0],
      [4, 8],
      [100, 8],
    ]) {
      expect(app.pocketAt(page, slot)).toBe(site.pocketAt(page, slot));
    }
    for (const pockets of [[], [0], [8], [9, 3], [44], [899]]) {
      expect(app.firstEmptyPage(pockets)).toBe(site.firstEmptyPage(pockets));
    }
    for (let slot = 0; slot < 9; slot += 1) {
      expect(app.pocketCrop(slot, 1500, 2100)).toEqual(
        site.pocketCrop(slot, 1500, 2100),
      );
    }
    for (const n of [1, 4, 10]) {
      expect(app.startingAtLine(n)).toBe(site.startingAtLine(n));
      expect(app.takePageLabel(n)).toBe(site.takePageLabel(n));
      expect(app.addPagesLabel(n)).toBe(site.addPagesLabel(n));
      expect(app.pageStatusLine(n, 3, 9)).toBe(site.pageStatusLine(n, 3, 9));
      expect(app.pageStatusLine(n, 0, 0)).toBe(site.pageStatusLine(n, 0, 0));
    }
    const result = { added: 41, merged: 2, occupied: 1, skipped: 0 };
    expect(app.pagesPlacedLine(result)).toBe(site.pagesPlacedLine(result));
  });

  it("come from scan-copy on the screen, never typed in again", () => {
    for (const [name, text] of [
      ["pages", src.pages],
      ["scanner", src.scanner],
      ["viewer", src.viewer],
    ] as const) {
      expect(text, name).toContain('} from "./scan-copy";');
    }
    for (const [text, word] of [
      [src.scanner, "{startingAtLine(start)}"],
      [src.scanner, "label={retake ? takePageLabel(retake.page) : TAKE_PHOTO}"],
      [src.scanner, "lessLabel={START_EARLIER}"],
      [src.scanner, "moreLabel={START_LATER}"],
      [src.scanner, "failure: sendRefusalLine(result.reason),"],
      [src.pages, "<Title>{CHECK_PAGES}</Title>"],
      [src.pages, "label={addPagesLabel(chosenPages)}"],
      [src.pages, "label={RETAKE}"],
      [src.pages, "PAGE_FAILED"],
      [src.pages, "READING_PAGE"],
      [src.pages, "{POCKET_EMPTY}"],
      [src.pages, "POCKET_UNREAD"],
      [src.viewer, "{OTHER_MATCHES}"],
      [src.viewer, "label={FIND_THE_CARD}"],
      [src.viewer, "label={LEAVE_EMPTY}"],
      [src.viewer, "{POCKET_TAKEN}"],
      [src.viewer, "{POCKET_UNREAD}"],
      [src.viewer, "{POCKET_EMPTY}"],
    ] as const) {
      expect(text, word).toContain(word);
    }
    for (const text of [src.pages, src.scanner, src.viewer]) {
      const code = text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
      for (const value of [
        site.CHECK_PAGES,
        site.POCKET_TAKEN,
        site.POCKET_UNREAD,
        site.PAGE_FAILED,
        site.FIND_THE_CARD,
        site.LEAVE_EMPTY,
      ]) {
        expect(code).not.toContain(value);
      }
    }
  });
});

describe("pages from the one scanner", () => {
  it("has no switch: a photo the reader calls a page is sent as one", () => {
    expect(src.sheet).not.toContain("ScanKind");
    expect(src.sheet).not.toContain("SCAN_ONE");
    expect(src.sheet).not.toContain("<PageScanner");
    expect(src.pages).not.toContain("export function PageScanner(");
    expect(src.scanner).toContain('if (next.kind === "send-page") {');
    expect(src.scanner).toContain("await queuePage(photo, view);");
  });

  it("puts nothing in the tray from pages, and ends with the pages sent, not placed", () => {
    const queue = src.scanner.slice(
      src.scanner.indexOf("const queuePage = async"),
      src.scanner.indexOf("const shoot = async"),
    );
    expect(queue).not.toContain("onAdd");
    expect(src.scanner).not.toContain("addBinderCards");
    expect(src.pages).not.toContain("addBinderCards");
    /* Done says whether pages went; the menu keeps its tray. */
    expect(src.scanner).toContain(
      'onClose(queue.some((page) => page.status === "sent"));',
    );
    const closed = src.sheet.slice(src.sheet.indexOf("onClose={(sent) => {"));
    expect(closed.slice(0, 200)).toContain("onPagesSent();");
    expect(closed.slice(0, 200)).not.toContain("onAdded");
    expect(closed.slice(0, 200)).not.toContain("reset()");
  });

  it("starts at the first empty page of this binder", () => {
    expect(src.sheet).toContain("occupied={cards.map((card) => card.pocket)}");
    expect(src.scanner).toContain(
      "useState(() => retake?.page ?? firstEmptyPage(occupied))",
    );
    expect(src.scanner).toContain("max={BINDER_PAGES}");
    expect(src.scanner).toContain("min={1}");
    /* The chip comes once a page has been shot. */
    expect(src.scanner).toContain("{!retake && pagesOut ? (");
  });
});

describe("the photo of a page", () => {
  it("is guided by the one card-shaped outline: a nine-pocket page is a card's shape too", () => {
    const frame = guideFrame(360, 520);
    expect(frame.width / frame.height).toBeCloseTo(CARD_ASPECT, 5);
    expect(src.scanner).toContain(
      "const frame = view ? guideFrame(view.width, view.height) : null;",
    );
    expect(src.scanner.match(/styles\.frame,/g)).toHaveLength(1);
  });

  it("is cut to the outline, then into pockets with the website's pocketCrop", () => {
    const region = { originX: 120, originY: 300, width: 1500, height: 2100 };
    for (let slot = 0; slot < 9; slot += 1) {
      const cut = site.pocketCrop(slot, region.width, region.height);
      expect(pocketBox(slot, region)).toEqual({
        originX: cut.x,
        originY: cut.y,
        width: cut.width,
        height: cut.height,
      });
      expect(pocketInPhoto(slot, region)).toEqual({
        originX: region.originX + cut.x,
        originY: region.originY + cut.y,
        width: cut.width,
        height: cut.height,
      });
    }
    /* The outline exactly: each pocket carries its own margin. */
    expect(src.scanner).toContain(
      "const region = frameInPhoto(guideFrame(view.width, view.height), view, photo, 0);",
    );
    expect(src.scanner).toContain("cutPocket(photo.uri, pocketInPhoto(slot, region))");
  });

  it("sends each pocket shrunk to SCAN_LONG_EDGE, never enlarged, as JPEG at 0.6", () => {
    expect(src.scanner).toContain("cutJpeg(uri, crop, scanResize(crop))");
    expect(src.scanner).toContain("[{ crop }, { resize }]");
    expect(src.scanner).toContain("let quality = 0.6;");
    expect(src.scanner).toContain("format: SaveFormat.JPEG,");
    expect(src.scanner).toContain("(out.base64.length * 3) / 4 <= SCAN_MAX_BYTES");
    expect(scanResize({ width: 700, height: 980 })).toEqual({ height: 980 });
    expect(scanResize({ width: 1500, height: 2100 })).toEqual({
      height: site.SCAN_LONG_EDGE,
    });
    /* The check shows the server's photos of each pocket. */
    expect(src.pages).toContain("photo: page.photos.pockets[pocket.slot] ?? null,");
  });
});

describe("the queue", () => {
  const page = (status: "waiting" | "sending" | "sent" | "refused") => ({ status });

  it("sends one page at a time, in queue order", () => {
    expect(nextToSend([])).toBe(-1);
    expect(nextToSend([page("waiting"), page("waiting")])).toBe(0);
    expect(nextToSend([page("sent"), page("refused"), page("waiting")])).toBe(2);
    expect(nextToSend([page("sending"), page("waiting")])).toBe(-1);
    expect(nextToSend([page("waiting"), page("sending")])).toBe(-1);
    /* And the screen holds one in flight whatever the queue does. */
    const round = src.scanner.slice(
      src.scanner.indexOf("if (sending.current) return;"),
    );
    expect(round).toContain("const at = nextToSend(queue);");
    expect(round).toContain("sending.current = page.id;");
    expect(round).toContain("sending.current = null;");
    expect(src.scanner).not.toContain("Promise.all(queue");
  });

  it("holds at most MAX_SCAN_PAGES, inside the binder's pages", () => {
    expect(canTakeAnother(1, 0)).toBe(true);
    expect(canTakeAnother(11, site.MAX_SCAN_PAGES)).toBe(false);
    expect(canTakeAnother(site.BINDER_PAGES, 0)).toBe(true);
    expect(canTakeAnother(site.BINDER_PAGES + 1, 1)).toBe(false);
    expect(src.scanner).toContain("!canTakeAnother(number, queue.length)");
  });
});

describe("checking and placing", () => {
  const a = { cardId: "a", printingId: "pa" };
  const b = { cardId: "b", printingId: null };

  it("sends each chosen card to pocketAt(the page's own number, slot), and no empty one", () => {
    const pages = [
      { page: 4, choices: [a, null, null, null, null, null, null, null, b] },
      { page: 5, choices: [] },
      /* Page 6 was removed: page 7 keeps its own number. */
      { page: 7, choices: [null, a, null, null, null, null, null, null, null] },
    ];
    expect(pagePlacements(pages)).toEqual([
      { pocket: site.pocketAt(4, 0), ...a },
      { pocket: site.pocketAt(4, 8), ...b },
      { pocket: site.pocketAt(7, 1), ...a },
    ]);
    expect(pagesWithCards(pages.map((one) => one.choices))).toBe(2);
    expect(pagesWithCards([[null, null]])).toBe(0);
  });

  it("checks the grid before anything is placed, in the check, not the camera", () => {
    expect(src.pages).toContain("function PageCheck(");
    expect(src.pages).toContain("label={addPagesLabel(chosenPages)}");
    expect(src.scanner).not.toContain("placePageQueue");
    expect(src.pages.match(/placePageQueue\(/g)).toHaveLength(1);
    expect(src.pages).toContain("const placements = pagePlacements(choices);");
  });

  it("retakes a failed page in the scanner, into the same queue, and reads the queue again", () => {
    const retake = src.pages.slice(src.pages.indexOf("<CardScanner"));
    expect(retake).toContain("visible={retaking !== null}");
    expect(retake).toContain("retake={{ batchId, page: retaking ?? 1 }}");
    expect(retake).toContain("setRetaking(null);");
    expect(retake).toContain("if (sent) void load();");
  });

  it("leaves a pocket empty when asked, and it is not sent", () => {
    expect(src.pages).toContain("choose(shown[index].key, null);");
    expect(src.pages).toContain(
      "pick ? { cardId: pick.hit.id, printingId: pick.printingId } : null,",
    );
  });

  it("marks a pocket already full in this binder", () => {
    expect(src.pages).toContain("taken: taken.has(pocketAt(page.page, pocket.slot)),");
    expect(src.pages).toContain("const taken = new Set(occupied);");
    expect(src.viewer).toContain("{pocket.taken ? (");
  });

  it("finds a pocket's card with the Flare picker itself, the read name typed", () => {
    expect(src.pages).toContain('lookFor: read ? read.englishName || read.name : "",');
    expect(src.viewer).toContain("<CardSelectSheet");
    expect(src.viewer).toContain("setFinding({ text: pocket.lookFor });");
    expect(src.viewer).toContain("searchFor={finding}");
    expect(src.viewer).toContain("<PrintingChips");
    expect(src.viewer).toContain("export function PrintingChips(");
  });

  it("asks for the camera through the one scanner's gate", () => {
    expect(src.scanner).toContain("<CameraAllowed>");
    expect(src.pages).not.toMatch(/useCameraPermissions|requestCameraPermissionsAsync/);
    expect(src.scanner).toContain("export function CameraAllowed(");
  });

  it("posts the placements to the queue's own route, which closes it", () => {
    const place = src.api.slice(
      src.api.indexOf("export async function placePageQueue("),
    );
    expect(flat(place.slice(0, 1200))).toContain('"POST", PAGES_PATH,');
    expect(flat(place.slice(0, 1200))).toContain(
      '{ action: "place", batchId, placements: part.placements, last: part.last },',
    );
    expect(src.api).toContain('const PAGES_PATH = "/api/v1/scans/pages";');
    expect(src.api).not.toContain("placeBinderPages");
  });
});

/* ---- The upload, run for real against a stubbed fetch -------------- */

type Sent = { path: string; action: string; inBody: boolean };

/*
 * The app's api module, loaded by a path TypeScript does not follow: a
 * plain import would pull mobile/src/api.ts into the website's type
 * graph, and its Expo imports live only in mobile/node_modules, which
 * the website's build never installs (see app-cache.test.ts). Without
 * the app's packages installed the block skips, and says so.
 */
interface AppApi {
  scanCardPhoto: (base64: string) => Promise<unknown>;
  sendScanPage: (input: {
    binderId: string;
    batchId: string;
    pageNumber: number;
    page: string;
    pockets: (string | null)[];
  }) => Promise<unknown>;
  uploadAvatar: (
    base64: string,
    onProgress?: undefined,
    kind?: "avatar" | "cover",
  ) => Promise<void>;
}
const API_PATH = "../../mobile/src/api";
const loadApi = () => import(/* @vite-ignore */ API_PATH) as Promise<AppApi>;
const appInstalled = existsSync(
  resolve(import.meta.dirname, "../../mobile/node_modules/expo-secure-store"),
);

describe.skipIf(!appInstalled)("the faster upload (needs mobile/node_modules)", () => {
  let sent: Sent[];
  let answer: (sent: Sent) => Response | "network";

  const ok = (body: unknown) =>
    new Response(JSON.stringify(body), {
      status: 200,
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
        const payload = JSON.parse(
          header ? decodeURIComponent(header) : String(init.body ?? "{}"),
        ) as { action: string };
        const one = {
          path: new URL(url).pathname,
          action: payload.action,
          inBody: init.body !== undefined,
        };
        sent.push(one);
        const reply = answer(one);
        if (reply === "network") throw new TypeError("Network request failed");
        return reply;
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const pieces = (one: Sent) =>
    one.action === "begin"
      ? ok({ uploadId: "00000000-0000-4000-8000-000000000000" })
      : one.action === "chunk"
        ? ok({ ok: true })
        : one.action === "read"
          ? ok({ ok: false, reason: "no-card" })
          : one.action === "send"
            ? ok({ ok: true, scanId: "s", left: 19 })
            : ok({ ok: true });

  const BINDER = "00000000-0000-4000-8000-0000000000b1";
  const BATCH = "00000000-0000-4000-8000-0000000000b2";
  const pageOf = (pockets: (string | null)[]) => ({
    binderId: BINDER,
    batchId: BATCH,
    pageNumber: 4,
    page: "UEFHRQ",
    pockets,
  });

  it("probes once a session, then sends a card whole in its body", async () => {
    answer = (one) =>
      one.action === "read-direct"
        ? ok({ ok: false, reason: "no-card" })
        : ok({ ok: true });
    const api = await loadApi();
    await api.scanCardPhoto("QUJD".repeat(4000));
    await api.scanCardPhoto("QUJD".repeat(4000));
    expect(sent.map((one) => one.action)).toEqual([
      "probe",
      "read-direct",
      "read-direct",
    ]);
    expect(sent.every((one) => one.inBody)).toBe(true);
    expect(sent.every((one) => one.path === "/api/v1/cards/scan")).toBe(true);
  });

  it("sends a page whole: the page and nine pockets in one body, to be read later", async () => {
    answer = (one) =>
      one.action === "send-direct"
        ? ok({ ok: true, scanId: "s", left: 19 })
        : ok({ ok: true });
    const api = await loadApi();
    await expect(
      api.sendScanPage(pageOf(Array.from({ length: 9 }, () => "QUJD"))),
    ).resolves.toEqual({ ok: true, scanId: "s", left: 19 });
    expect(sent.map((one) => `${one.path} ${one.action}`)).toEqual([
      "/api/v1/cards/scan probe",
      "/api/v1/scans/pages send-direct",
    ]);
  });

  it("goes in pieces when the probe does not arrive, all session", async () => {
    answer = (one) => (one.inBody ? "network" : pieces(one));
    const api = await loadApi();
    await api.scanCardPhoto("A".repeat(12_001));
    await api.scanCardPhoto("A".repeat(10));
    expect(sent.map((one) => one.action)).toEqual([
      "probe",
      "begin",
      "chunk",
      "chunk",
      "chunk",
      "read",
      "begin",
      "chunk",
      "read",
    ]);
    expect(sent.filter((one) => one.inBody).map((one) => one.action)).toEqual([
      "probe",
    ]);
  });

  it("falls back to pieces when a whole upload dies on the way, and remembers", async () => {
    answer = (one) =>
      one.action === "probe" ? ok({ ok: true }) : one.inBody ? "network" : pieces(one);
    const api = await loadApi();
    await api.sendScanPage(
      pageOf(["QUJD", null, "QUJD", null, null, null, null, null, null]),
    );
    await api.scanCardPhoto("QUJD");
    expect(sent.map((one) => one.action)).toEqual([
      "probe",
      "send-direct",
      /* The page, then a pocket at a time: each its own upload and pieces. */
      "begin",
      "chunk",
      "begin",
      "chunk",
      "begin",
      "chunk",
      "send",
      /* Remembered: no whole try for the next photo. */
      "begin",
      "chunk",
      "read",
    ]);
    expect(sent.find((one) => one.action === "send")?.path).toBe("/api/v1/scans/pages");
  });

  it("takes an HTTP error as the answer and never sends it again in pieces", async () => {
    answer = (one) =>
      one.action === "read-direct"
        ? new Response(JSON.stringify({ error: "limit" }), { status: 429 })
        : ok({ ok: true });
    const api = await loadApi();
    await expect(api.scanCardPhoto("QUJD")).rejects.toMatchObject({ status: 429 });
    expect(sent.map((one) => one.action)).toEqual(["probe", "read-direct"]);
  });

  it("uses the same rule for a profile picture", async () => {
    answer = (one) => (one.action === "direct" ? ok({ ok: true }) : ok({ ok: true }));
    let api = await loadApi();
    await api.uploadAvatar("QUJD", undefined, "cover");
    expect(sent.map((one) => `${one.path} ${one.action}`)).toEqual([
      "/api/v1/cards/scan probe",
      "/api/v1/avatar direct",
    ]);

    /* And a body that dies on the way goes again in pieces. */
    vi.resetModules();
    sent = [];
    answer = (one) =>
      one.action === "probe"
        ? ok({ ok: true })
        : one.inBody
          ? "network"
          : one.action === "begin"
            ? ok({ uploadId: "00000000-0000-4000-8000-000000000000" })
            : ok({ ok: true });
    api = await loadApi();
    await api.uploadAvatar("QUJD");
    expect(sent.map((one) => one.action)).toEqual([
      "probe",
      "direct",
      "begin",
      "chunk",
      "commit",
    ]);
  });
});

describe("the probe, as written", () => {
  it("probes with a tiny body, on a short clock, once per session", () => {
    const probe = src.api.slice(
      src.api.indexOf("function bodiesGetThrough("),
      src.api.indexOf("async function sendWhole<T>("),
    );
    expect(flat(probe)).toContain('{ action: "probe" }, false, 6_000, true,');
    expect(probe).toContain(
      "if (bodiesPass !== null) return Promise.resolve(bodiesPass);",
    );
    expect(probe).toContain("probing ??=");
    const whole = src.api.slice(src.api.indexOf("async function sendWhole<T>("));
    expect(whole).toContain("timeoutMs = 60_000,");
    expect(whole).toContain("if (caught instanceof ApiError && caught.status === 0) {");
    expect(whole).toContain("bodiesPass = false;");
  });
});
