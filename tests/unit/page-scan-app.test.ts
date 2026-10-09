import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  canTakeAnother,
  lastStartPage,
  nextToRead,
  pageCells,
  pageCounts,
  pageFrame,
  pagePlacements,
  pagesWithCards,
  pocketBox,
  pocketInPhoto,
} from "../../mobile/src/page-scan";
import * as app from "../../mobile/src/scan-copy";
import { CARD_ASPECT, scanResize } from "../../mobile/src/scan-frame";
import * as site from "@/lib/cards/scan-rules";

/**
 * Whole binder pages in the app. The founder (2026-10-09): "scan, let's
 * say 5 pages of their binder into a queue and it auto fills in an
 * actual binder, with the exact same location the cards were in in
 * their binder", and the single scan kept "fast and quick". The app's
 * page scanner is the website's: the same words, the same steps, the
 * same cuts, and a faster upload with the old pieces as its fallback.
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
    expect(src.pages).toContain('} from "./scan-copy";');
    for (const word of [
      "{startingAtLine(start)}",
      "{PAGES_HINT}",
      "label={takePageLabel(nextNumber)}",
      "label={CHECK_PAGES}",
      "{IS_THIS_IT}",
      "{OTHER_MATCHES}",
      "label={FIND_THE_CARD}",
      "label={LEAVE_EMPTY}",
      "{POCKET_TAKEN}",
      "{POCKET_UNREAD}",
      "{POCKET_EMPTY}",
      "{RETAKE}",
      "{REMOVE_PAGE}",
      "label={addPagesLabel(chosenPages)}",
      "SCAN_REFUSALS[outcome.reason]",
      "PAGE_FAILED",
      "READING_PAGE",
      "pageStatusLine(number, found, cards)",
      "label={BACK_TO_PAGES}",
      "lessLabel={START_EARLIER}",
      "moreLabel={START_LATER}",
    ]) {
      expect(src.pages, word).toContain(word);
    }
    const code = src.pages.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    for (const value of [
      site.PAGES_HINT,
      site.CHECK_PAGES,
      site.POCKET_TAKEN,
      site.POCKET_UNREAD,
      site.PAGE_FAILED,
      site.FIND_THE_CARD,
      site.LEAVE_EMPTY,
    ]) {
      expect(code).not.toContain(value);
    }
  });
});

describe("the switch on the scan tab", () => {
  it("is One card (today's scanner, the default) or Whole pages", () => {
    expect(src.sheet).toContain(
      'const [scanKind, setScanKind] = useState<ScanKind>("one");',
    );
    expect(flat(src.sheet)).toContain('["one", SCAN_ONE], ["pages", SCAN_PAGES],');
    const body = src.sheet.slice(src.sheet.indexOf("const scanBody = ("));
    expect(body.indexOf('scanKind === "pages" ? (')).toBeGreaterThan(-1);
    expect(body.indexOf("<PageScanner")).toBeLessThan(body.indexOf("<CardScanner"));
    /* The switch sits on the scan tab, under the same gate as before. */
    expect(flat(src.sheet)).toContain(
      '...(scanAccess === "on" ? [["scan", SCAN_CARD] as const] : [])',
    );
    expect(src.sheet).toContain(
      'body={mode === "paste" ? pasteBody : mode === "scan" ? scanBody : undefined}',
    );
  });

  it("puts nothing in the tray from pages, and ends as the tray's Add does", () => {
    expect(src.pages).not.toContain("onAdd");
    expect(src.pages).not.toContain("addBinderCards");
    expect(src.sheet).toContain("onPlaced={placed}");
    const placed = src.sheet.slice(
      src.sheet.indexOf("const placed ="),
      src.sheet.indexOf("const pages ="),
    );
    expect(placed).toContain("reset();");
    expect(placed).toContain("onAdded(result);");
    /* No tray and no tray button under the pages. */
    expect(src.sheet).toContain("const footer = pages ? (");
  });

  it("starts at the first empty page of this binder", () => {
    expect(src.sheet).toContain("occupied={cards.map((card) => card.pocket)}");
    expect(src.pages).toContain("useState(() => firstEmptyPage(occupied))");
    expect(src.pages).toContain("max={lastStartPage(queue.length)}");
    expect(src.pages).toContain("min={1}");
  });
});

describe("the photo of a page", () => {
  it("is guided as nine card-shaped cells, three by three", () => {
    const frame = pageFrame(360, 520);
    expect(frame.width / frame.height).toBeCloseTo(CARD_ASPECT, 5);
    const cells = pageCells(frame);
    expect(cells).toHaveLength(9);
    for (const cell of cells) {
      expect(cell.width / cell.height).toBeCloseTo(2.5 / 3.5, 5);
    }
    expect(cells[8].x + cells[8].width).toBeCloseTo(frame.x + frame.width, 5);
    expect(cells[8].y + cells[8].height).toBeCloseTo(frame.y + frame.height, 5);
    expect(src.pages).toContain("pageCells(frame).map((cell, slot) => (");
  });

  it("is cut to the guide, then into pockets with the website's pocketCrop", () => {
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
    /* The guide exactly: each pocket carries its own margin. */
    expect(src.pages).toContain(
      "const region = frameInPhoto(pageFrame(view.width, view.height), view, photo, 0);",
    );
    expect(src.pages).toContain("cutPocket(photo.uri, pocketInPhoto(slot, region))");
  });

  it("sends each pocket shrunk to SCAN_LONG_EDGE, never enlarged, as JPEG at 0.6", () => {
    expect(src.pages).toContain("[{ crop }, { resize: scanResize(crop) }]");
    expect(src.pages).toContain("let quality = 0.6;");
    expect(src.pages).toContain("format: SaveFormat.JPEG,");
    expect(src.pages).toContain("(out.base64.length * 3) / 4 <= SCAN_MAX_BYTES");
    expect(scanResize({ width: 700, height: 980 })).toEqual({ height: 980 });
    expect(scanResize({ width: 1500, height: 2100 })).toEqual({
      height: site.SCAN_LONG_EDGE,
    });
    /* Each pocket's photo is kept for the check grid. */
    expect(src.pages).toContain("photo={page.cells[pocket.slot]?.uri ?? null}");
  });
});

describe("the queue", () => {
  const page = (status: "waiting" | "reading" | "read" | "failed") => ({ status });

  it("reads one page at a time, in queue order", () => {
    expect(nextToRead([])).toBe(-1);
    expect(nextToRead([page("waiting"), page("waiting")])).toBe(0);
    expect(nextToRead([page("read"), page("failed"), page("waiting")])).toBe(2);
    expect(nextToRead([page("reading"), page("waiting")])).toBe(-1);
    expect(nextToRead([page("waiting"), page("reading")])).toBe(-1);
    /* And the screen holds one in flight whatever the queue does. */
    const round = src.pages.slice(src.pages.indexOf("if (reading.current) return;"));
    expect(round).toContain("const at = nextToRead(queue);");
    expect(round).toContain("reading.current = page.id;");
    expect(round).toContain("reading.current = null;");
    expect(src.pages).not.toContain("Promise.all(queue");
  });

  it("holds at most MAX_SCAN_PAGES, inside the binder's pages", () => {
    expect(canTakeAnother(1, 0)).toBe(true);
    expect(canTakeAnother(1, site.MAX_SCAN_PAGES)).toBe(false);
    expect(canTakeAnother(site.BINDER_PAGES, 0)).toBe(true);
    expect(canTakeAnother(site.BINDER_PAGES, 1)).toBe(false);
    expect(lastStartPage(0)).toBe(site.BINDER_PAGES);
    expect(lastStartPage(3)).toBe(site.BINDER_PAGES - 2);
  });

  it("counts a read page as the website does", () => {
    expect(
      pageCounts([
        { state: "found" },
        { state: "found" },
        { state: "unread" },
        { state: "empty" },
      ]),
    ).toEqual({ found: 2, cards: 3 });
  });
});

describe("checking and placing", () => {
  const a = { cardId: "a", printingId: "pa" };
  const b = { cardId: "b", printingId: null };

  it("sends each chosen card to pocketAt(start + queue place, slot), and no empty one", () => {
    const pages = [
      [a, null, null, null, null, null, null, null, b],
      [],
      [null, a, null, null, null, null, null, null, null],
    ];
    expect(pagePlacements(4, pages)).toEqual([
      { pocket: site.pocketAt(4, 0), ...a },
      { pocket: site.pocketAt(4, 8), ...b },
      { pocket: site.pocketAt(6, 1), ...a },
    ]);
    expect(pagesWithCards(pages)).toBe(2);
    expect(pagesWithCards([[null, null]])).toBe(0);
  });

  it("checks the grid before anything is placed", () => {
    const check = src.pages.indexOf('if (step === "check") {');
    const shoot = src.pages.indexOf("label={takePageLabel(nextNumber)}");
    const add = src.pages.indexOf("label={addPagesLabel(chosenPages)}");
    expect(check).toBeGreaterThan(-1);
    expect(add).toBeGreaterThan(check);
    expect(add).toBeLessThan(shoot);
    expect(src.pages).toContain('onPress={() => setStep("check")}');
    expect(src.pages.match(/placeBinderPages\(/g)).toHaveLength(1);
    expect(src.pages).toContain("const placements = pagePlacements(start, choices);");
  });

  it("goes back to the camera from the check with the queue intact", () => {
    const back = src.pages.slice(src.pages.indexOf("label={BACK_TO_PAGES}"));
    expect(back.slice(0, 200)).toContain('setStep("shoot");');
    expect(back.slice(0, 200)).not.toContain("setQueue");
    expect(src.pages.indexOf("label={BACK_TO_PAGES}")).toBeGreaterThan(
      src.pages.indexOf('if (step === "check") {'),
    );
  });

  it("opens a pocket in the website's order", () => {
    const detail = src.pages.slice(src.pages.indexOf("function PocketDetail("));
    const order = [
      "source={{ uri: photo }}",
      "{IS_THIS_IT}",
      "{OTHER_MATCHES}",
      "<PrintingChips",
      "label={FIND_THE_CARD}",
      "label={LEAVE_EMPTY}",
    ].map((mark) => detail.indexOf(mark));
    expect(order.every((at) => at > -1)).toBe(true);
    expect([...order].sort((x, y) => x - y)).toEqual(order);
  });

  it("leaves a pocket empty when asked, and it is not sent", () => {
    expect(src.pages).toContain("choose(page.id, openSlot, null);");
    expect(src.pages).toContain(
      "pick ? { cardId: pick.hit.id, printingId: pick.printingId } : null,",
    );
  });

  it("marks a pocket already full in this binder", () => {
    expect(src.pages).toContain("taken={taken.has(pocketAt(number, pocket.slot))}");
    expect(src.pages).toContain("const taken = new Set(occupied);");
  });

  it("finds a pocket's card with the picker's own search, the read name typed", () => {
    expect(src.pages).toContain(
      'const lookFor = read ? read.englishName || read.name : "";',
    );
    expect(src.pages).toContain('const search = useCardSearch({ kind: "list" });');
    /* The single scan's printing chips, the one component. */
    expect(src.pages).toContain("<PrintingChips");
    expect(src.scanner).toContain("export function PrintingChips(");
  });

  it("asks for the camera through the single scanner's gate", () => {
    expect(src.pages).toContain("<CameraAllowed>");
    expect(src.pages).not.toMatch(/useCameraPermissions|requestCameraPermissionsAsync/);
    expect(src.scanner).toContain("export function CameraAllowed(");
  });

  it("posts the placements to the tray's route", () => {
    const place = src.api.slice(
      src.api.indexOf("export async function placeBinderPages("),
    );
    expect(flat(place.slice(0, 1200))).toContain(
      '"POST", `${binderPath(binderId)}/cards`',
    );
    expect(place).toContain("placements: placements.slice(start, start + per)");
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
  scanPagePhotos: (cells: (string | null)[]) => Promise<unknown>;
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
          : one.action === "read-page"
            ? ok({ ok: true, pockets: [] })
            : ok({ ok: true });

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

  it("sends a page whole: nine pockets in one body", async () => {
    answer = (one) =>
      one.action === "read-page-direct"
        ? ok({ ok: true, pockets: [] })
        : ok({ ok: true });
    const api = await loadApi();
    await api.scanPagePhotos(Array.from({ length: 9 }, () => "QUJD"));
    expect(sent.map((one) => one.action)).toEqual(["probe", "read-page-direct"]);
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
    await api.scanPagePhotos([
      "QUJD",
      null,
      "QUJD",
      null,
      null,
      null,
      null,
      null,
      null,
    ]);
    await api.scanCardPhoto("QUJD");
    expect(sent.map((one) => one.action)).toEqual([
      "probe",
      "read-page-direct",
      /* A pocket at a time: its own upload, its own pieces. */
      "begin",
      "chunk",
      "begin",
      "chunk",
      "read-page",
      /* Remembered: no whole try for the next photo. */
      "begin",
      "chunk",
      "read",
    ]);
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
