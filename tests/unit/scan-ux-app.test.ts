import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { needsLook } from "../../mobile/src/page-scan";
import * as app from "../../mobile/src/scan-copy";
import {
  NO_SCAN_RIGHTS,
  afterSingleScan,
  countsAsFreeScan,
  freeScansGone,
  rightsAfter,
  type ScanRights,
} from "../../mobile/src/scan-flow";
import * as site from "@/lib/cards/scan-rules";

/**
 * One scanner, a full-screen card viewer, no tabs, and the glowing PRO
 * mark, in the app. The founder (2026-10-09): "a unified scan - it can
 * detect if it's scanning a full page and says you need pro for that",
 * "it should just have a popup full card viewer and a contextual menu
 * there", "all the tabs of 'scan' etc having 3 tabs seems redundant",
 * "Free singles up to 10 a day", and "a glowing green pro moniker that
 * matches our main brand color".
 *
 * Read off the source where it has to be: the app has no renderer in
 * the test run. The rules run for real.
 */

const read = (path: string) =>
  readFileSync(resolve(import.meta.dirname, "../..", path), "utf8");
const flat = (text: string) => text.replace(/\s+/g, " ");
const code = (text: string) =>
  text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const src = {
  sheet: read("mobile/src/binder-add-sheet.tsx"),
  select: read("mobile/src/card-select.tsx"),
  scanner: read("mobile/src/card-scanner.tsx"),
  viewer: read("mobile/src/card-viewer.tsx"),
  pages: read("mobile/src/page-scanner.tsx"),
  api: read("mobile/src/api.ts"),
  binder: read("mobile/src/screens/binder.tsx"),
  words: read("mobile/src/pro-words.tsx"),
};

/** From one mark to the next, so an order can be checked. */
const between = (text: string, from: string, to: string) => {
  const start = text.indexOf(from);
  return start < 0 ? "" : text.slice(start, text.indexOf(to, start + from.length));
};

describe("the words", () => {
  it("mirror the website's One scanner block, word for word", () => {
    for (const name of [
      "FREE_SCANS_PER_DAY",
      "SCAN_TITLE",
      "SCAN_INTRO_SINGLE",
      "SCAN_INTRO_PAGES",
      "FILL_THE_FRAME",
      "PAGES_ARE_PRO",
      "GET_PRO",
      "THATS_IT",
      "NOT_THIS_CARD",
      "OTHER_PRINTING",
      "YOUR_PHOTO",
      "OUR_MATCH",
    ] as const) {
      expect(app[name], name).toBe(site[name]);
    }
    for (const n of [0, 1, 7, 10]) {
      expect(app.freeScansLeftLine(n)).toBe(site.freeScansLeftLine(n));
      expect(app.pageAddedLine(n + 1)).toBe(site.pageAddedLine(n + 1));
      expect(app.checkUnsureLabel(n)).toBe(site.checkUnsureLabel(n));
    }
    expect(app.SCAN_REFUSALS["is-page"]).toBe(site.SCAN_REFUSALS["is-page"]);
    expect(app.SCAN_REFUSALS["daily-singles"]).toBe(
      site.SCAN_REFUSALS["daily-singles"],
    );
    const block = (text: string) => text.slice(text.indexOf("/* ---- One scanner"));
    expect(block(read("mobile/src/scan-copy.ts"))).toBe(
      block(read("src/lib/cards/scan-rules.ts")),
    );
  });

  it("are never typed in again on the screens", () => {
    for (const [name, text] of [
      ["sheet", code(src.sheet)],
      ["scanner", code(src.scanner)],
      ["viewer", code(src.viewer)],
      ["pages", code(src.pages)],
    ] as const) {
      for (const value of [
        site.SCAN_INTRO_SINGLE,
        site.SCAN_INTRO_PAGES,
        site.FILL_THE_FRAME,
        site.PAGES_ARE_PRO,
        site.GET_PRO,
        site.THATS_IT,
        site.NOT_THIS_CARD,
        site.OTHER_PRINTING,
        site.YOUR_PHOTO,
        site.OUR_MATCH,
        site.READING_IN_BACKGROUND,
        "free scans left",
        "Reading it in the background",
        "unsure",
      ]) {
        expect(text, `${name}: ${value}`).not.toContain(`"${value}`);
      }
    }
  });
});

describe("Add cards has no tabs", () => {
  it("is the search, then a large Scan, then Paste a list as a small link", () => {
    expect(src.sheet).not.toContain("switcher");
    expect(src.sheet).not.toContain("SCAN_CARD");
    expect(src.sheet).not.toContain("SCAN_ONE");
    expect(src.sheet).not.toContain("SCAN_PAGES");
    expect(src.sheet).toContain('type Mode = "search" | "paste";');
    /* The picker draws the field, then this, then the results. */
    const sheet = between(
      src.select,
      "export function CardSelectSheet(",
      "<ScrollView",
    );
    expect(sheet.indexOf("<GameSearchField")).toBeLessThan(
      sheet.indexOf("{belowSearch}"),
    );
    const below = between(src.sheet, "const belowSearch = (", "const tile =");
    const scan = below.indexOf("{SCAN_TITLE}");
    const paste = below.indexOf("{BINDER_ADD_COPY.paste}");
    expect(scan).toBeGreaterThan(-1);
    expect(paste).toBeGreaterThan(scan);
    expect(below).toContain('<Ionicons name="camera-outline"');
    expect(below).toContain("{rights.singles !== null ? (");
    expect(src.sheet).toContain("belowSearch={belowSearch}");
  });

  it("opens the pasted list from the link, with a way back to the search", () => {
    const paste = between(src.sheet, "const pasteBody = (", "{pasted === null ? (");
    expect(paste).toContain('setMode("search");');
    expect(paste).toContain("{BINDER_ADD_COPY.search}");
    expect(src.sheet).toContain('setMode("paste");');
  });

  it("keeps the tray and its button", () => {
    expect(src.sheet).toContain("label={addToBinderLabel(lines.length)}");
    expect(src.sheet).toContain("footer={footer}");
  });
});

describe("one scanner", () => {
  const rights = (over: Partial<ScanRights>): ScanRights => ({
    singles: "on",
    singlesLeft: null,
    pages: "on",
    ...over,
  });

  it("reads every photo as one card first, from the kept full photo", () => {
    const shoot = between(src.scanner, "const shoot = async", "const again =");
    const photo = shoot.indexOf("await camera.current.takePictureAsync(");
    const single = shoot.indexOf("await scanCardPhoto(shrunk.base64");
    const decide = shoot.indexOf("const next = afterSingleScan(answer, rights);");
    const page = shoot.indexOf("await queuePage(photo, view);", decide);
    expect(photo).toBeGreaterThan(-1);
    expect(single).toBeGreaterThan(photo);
    expect(decide).toBeGreaterThan(single);
    expect(page).toBeGreaterThan(decide);
    /* The page is cut from the photo the camera took, not the small one. */
    expect(src.scanner).toContain("const cut = await cutPage(photo, size);");
  });

  it("sends a page for Pro, opens the door to Pro for anyone else, and for the day's free scans", () => {
    expect(afterSingleScan({ ok: true }, rights({}))).toEqual({ kind: "viewer" });
    expect(afterSingleScan({ ok: false, reason: "is-page" }, rights({}))).toEqual({
      kind: "send-page",
    });
    expect(
      afterSingleScan({ ok: false, reason: "is-page" }, rights({ pages: "pro-door" })),
    ).toEqual({ kind: "pro", why: "pages" });
    expect(
      afterSingleScan({ ok: false, reason: "is-page" }, rights({ pages: null })),
    ).toEqual({ kind: "pro", why: "pages" });
    expect(afterSingleScan({ ok: false, reason: "daily-singles" }, rights({}))).toEqual(
      { kind: "pro", why: "daily-singles" },
    );
    expect(afterSingleScan({ ok: false, reason: "no-card" }, rights({}))).toEqual({
      kind: "refused",
      reason: "no-card",
    });
    const shoot = between(src.scanner, "const shoot = async", "const again =");
    expect(shoot).toContain('if (next.kind === "send-page") {');
    expect(shoot).toContain('setStep({ kind: "pro", why: next.why });');
  });

  it("goes straight to the door when no free scan is left, before anything is sent", () => {
    expect(
      freeScansGone(rights({ singles: "used-up", singlesLeft: 0, pages: "pro-door" })),
    ).toBe(true);
    expect(freeScansGone(rights({ singlesLeft: 3, pages: "pro-door" }))).toBe(false);
    expect(freeScansGone(rights({}))).toBe(false);
    const shoot = between(src.scanner, "const shoot = async", "const again =");
    const gone = shoot.indexOf("if (!retake && freeScansGone(rights)) {");
    expect(gone).toBeGreaterThan(-1);
    expect(gone).toBeLessThan(shoot.indexOf("takePictureAsync("));
  });

  it("counts the free scans down as the server does, and asks the server for its count", () => {
    const free = rights({ singlesLeft: 2, pages: "pro-door" });
    expect(rightsAfter(free, { ok: true })).toEqual({ ...free, singlesLeft: 1 });
    expect(rightsAfter(free, { ok: false, reason: "not-found" }).singlesLeft).toBe(1);
    /* A whole page, and a read that broke, are not a free scan. */
    expect(rightsAfter(free, { ok: false, reason: "is-page" })).toEqual(free);
    expect(rightsAfter(free, { ok: false, reason: "unavailable" })).toEqual(free);
    expect(countsAsFreeScan({ ok: false, reason: "no-card" })).toBe(true);
    expect(countsAsFreeScan({ ok: false, reason: "too-big" })).toBe(false);
    expect(
      rightsAfter(rights({ singlesLeft: 1, pages: "pro-door" }), { ok: true }),
    ).toEqual(rights({ singles: "used-up", singlesLeft: 0, pages: "pro-door" }));
    expect(rightsAfter(free, { ok: false, reason: "daily-singles" }).singles).toBe(
      "used-up",
    );
    /* Pro has no count. */
    expect(rightsAfter(rights({}), { ok: true })).toEqual(rights({}));
    expect(src.scanner).toContain("void getScanRights()");
    expect(NO_SCAN_RIGHTS).toEqual({ singles: null, singlesLeft: null, pages: null });
  });

  it("says what it scans at the top, PRO after the pages line, and the free scans left", () => {
    const top = between(src.scanner, "{SCAN_INTRO_SINGLE}", "<CameraAllowed>");
    expect(top).toContain("{SCAN_INTRO_PAGES} <ProMark size={15} />");
    expect(top.indexOf("{FILL_THE_FRAME}")).toBeGreaterThan(
      top.indexOf("{SCAN_INTRO_PAGES}"),
    );
    expect(top).toContain("{rights.singlesLeft !== null ? (");
    expect(top).toContain("{freeScansLeftLine(rights.singlesLeft)}");
  });

  it("draws the door to Pro: why, PRO large, Get Pro, Try again", () => {
    const door = between(
      src.scanner,
      '} else if (step.kind === "pro") {',
      '} else if (step.kind === "refused") {',
    );
    const order = [
      'step.why === "pages" ? PAGES_ARE_PRO : SCAN_REFUSALS["daily-singles"]',
      "<ProMark size={56} />",
      "label={GET_PRO}",
      "label={SCAN_AGAIN}",
    ].map((mark) => door.indexOf(mark));
    expect(order.every((at) => at > -1)).toBe(true);
    expect([...order].sort((x, y) => x - y)).toEqual(order);
    expect(door).toContain("<ProWords");
    /* Get Pro is the Pro screen. */
    expect(src.sheet).toContain('navigation.navigate("Pro");');
  });

  it("files pages under one queue for the session, on the page the chip says", () => {
    expect(src.scanner).toContain(
      "const [batchId] = useState(() => retake?.batchId ?? newBatchId());",
    );
    expect(src.scanner).toContain(
      "const [start, setStart] = useState(() => retake?.page ?? firstEmptyPage(occupied));",
    );
    expect(src.scanner).toContain("{`Page ${start}`}");
    expect(src.scanner).toContain("{startingAtLine(start)}");
    expect(src.scanner).toContain(
      "setToast({ line: pageAddedLine(page.number), alert: false });",
    );
    expect(src.scanner).toContain("{pagesLeftLine(leftNow)}");
  });

  it("is a full-screen Modal, and Done waits for the pages on their way", () => {
    expect(flat(src.scanner)).toContain(
      '<Modal visible={visible} animationType="slide"',
    );
    expect(src.scanner).toContain("label={DONE_SCANNING}");
    expect(src.scanner).toContain(
      "if (!finishing || stillSending(queue) || done.current) return;",
    );
    /* No "Whole pages" shooting step is left. */
    expect(src.pages).not.toContain("export function PageScanner(");
    expect(src.scanner).not.toContain("PAGES_HINT");
  });
});

describe("the card viewer", () => {
  it("is the single scan's answer and the page check's, the same component", () => {
    expect(src.scanner).toContain("<CardViewer");
    expect(src.scanner).toContain("pockets={[step.pocket]}");
    expect(src.pages).toContain("<CardViewer");
    expect(src.pages).toContain("pockets={shown}");
    expect(src.pages).not.toContain("function PocketDetail(");
  });

  it("puts Your photo beside Our match, the name and number under the match", () => {
    const pane = src.viewer.slice(src.viewer.indexOf("function Pane("));
    const photo = pane.indexOf("{YOUR_PHOTO}");
    const match = pane.indexOf("{OUR_MATCH}");
    const name = pane.indexOf("{pick.hit.name}");
    const number = pane.indexOf("{pick.hit.cardNumber}");
    expect(photo).toBeGreaterThan(-1);
    expect(match).toBeGreaterThan(photo);
    expect(name).toBeGreaterThan(match);
    expect(number).toBeGreaterThan(name);
  });

  it("offers That's it, Other printing, Not this card, Leave empty, in that order", () => {
    const menu = between(src.viewer, "<View style={styles.actions}>", "{panel ? (");
    const order = [
      "label={THATS_IT}",
      "label={OTHER_PRINTING}",
      "label={NOT_THIS_CARD}",
      "label={LEAVE_EMPTY}",
    ].map((mark) => menu.indexOf(mark));
    expect(order.every((at) => at > -1)).toBe(true);
    expect([...order].sort((x, y) => x - y)).toEqual(order);
    /* Leave empty is the page check's alone. */
    expect(menu).toContain("{onLeaveEmpty && pick ? (");
    expect(src.scanner).not.toContain("onLeaveEmpty");
  });

  it("shows the other guesses for Not this card, then Find the card with the read name", () => {
    const panel = between(src.viewer, '{panel === "others" ? (', "<CardSelectSheet");
    expect(panel.indexOf("{OTHER_MATCHES}")).toBeLessThan(
      panel.indexOf("label={FIND_THE_CARD}"),
    );
    /* Find the card is the Flare picker, the read name typed
       (tests/unit/scan-picker-app.test.ts). */
    expect(src.viewer).toContain("setFinding({ text: pocket.lookFor });");
    expect(src.viewer).toContain("<PrintingChips");
  });

  it("swipes across every pocket of every page, with Page N and nine dots", () => {
    expect(src.viewer).toContain("horizontal");
    expect(src.viewer).toContain("pagingEnabled");
    expect(src.viewer).toContain("{`Page ${pocket.page}`}");
    expect(src.viewer).toContain("<Dots slot={pocket.slot} />");
    expect(src.viewer).toContain("length: POCKETS_PER_PAGE");
    /* That's it moves on, and closes after the last. */
    expect(flat(src.pages)).toContain(
      "current && index < shown.length - 1 ? { keys: current.keys, at: index + 1 } : null",
    );
  });
});

describe("the check", () => {
  it("opens the viewer from any tile, at that pocket, walking every pocket", () => {
    const grid = between(src.pages, "<PocketTile", "))}");
    expect(grid).toContain("keys: all.map((each) => each.key),");
    expect(grid).toContain("at: all.findIndex((each) => each.key === pocket.key),");
    /* No panel under the grid any more. */
    expect(src.pages).not.toContain("openSlot");
  });

  it("shows our match's art, a ? for unread, and the unsure mark", () => {
    const tile = src.pages.slice(src.pages.indexOf("function PocketTile("));
    expect(tile).toContain(
      "const art = pick ? (pickArt(pick) ?? pocket.photo) : null;",
    );
    expect(tile).toContain("<Text style={styles.unknown}>?</Text>");
    expect(tile).toContain('<Ionicons name="help-circle"');
  });

  it("walks only the unsure and unread pockets with Check N unsure, until looked at", () => {
    expect(needsLook({ state: "found", sure: false }, false)).toBe(true);
    expect(needsLook({ state: "unread" }, false)).toBe(true);
    expect(needsLook({ state: "found", sure: true }, false)).toBe(false);
    expect(needsLook({ state: "found" }, false)).toBe(false);
    expect(needsLook({ state: "empty" }, false)).toBe(false);
    expect(needsLook({ state: "found", sure: false }, true)).toBe(false);
    expect(flat(src.pages)).toContain(
      "const doubtful = all.filter((pocket) => needsLook(pocket, looked[pocket.key] === true),",
    );
    expect(src.pages).toContain("label={checkUnsureLabel(doubtful.length)}");
    expect(src.pages).toContain(
      "onPress={() => setWalk({ keys: doubtful.map((pocket) => pocket.key), at: 0 })}",
    );
    expect(src.pages).toContain("{doubtful.length > 0 ? (");
  });

  it("keeps Add N pages and Throw these pages away", () => {
    expect(src.pages).toContain("label={addPagesLabel(chosenPages)}");
    expect(src.pages).toContain("label={THROW_PAGES_AWAY}");
  });
});

describe("the PRO mark", () => {
  const files = {
    pro: read("mobile/src/screens/pro.tsx"),
    settings: read("mobile/src/screens/settings.tsx"),
    store: read("mobile/src/screens/store.tsx"),
    customize: read("mobile/src/screens/customize.tsx"),
    editProfile: read("mobile/src/screens/edit-profile.tsx"),
    trades: read("mobile/src/trade-history.tsx"),
    stack: read("mobile/App.tsx"),
    scanner: src.scanner,
  };

  it("names the tier everywhere it is a heading, a badge, a lock or a door", () => {
    for (const [name, text] of Object.entries(files)) {
      expect(text, name).toMatch(
        /import \{ ProMark \} from "\.\.?\/(src\/)?pro-mark";/,
      );
      expect(text, name).toContain("<ProMark size={");
    }
    expect(files.pro).toContain("cardflare <ProMark size={13} />");
    expect(files.settings).toMatch(/<Title>\s*<ProMark size=\{18\} \/>\s*<\/Title>/);
    expect(files.store).toContain("<ProMark size={11} /> to wear");
    expect(files.trades).toContain("with cardflare <ProMark size={14} />.");
    expect(files.editProfile).toContain("mark={<ProMark size={15} />}");
    expect(files.stack).toContain("cardflare <ProMark size={17} />");
  });

  it("is never a Pro styled by hand", () => {
    for (const [name, text] of Object.entries(files)) {
      const body = code(text);
      for (const by of [
        "CARDFLARE PRO",
        "<Title>Pro</Title>",
        "Pro to wear",
        "with cardflare Pro.",
        "Tap to get Pro.",
        "Use a GIF (Pro)",
        "You are Pro.",
        ">PRO<",
      ]) {
        expect(body, `${name}: ${by}`).not.toContain(by);
      }
    }
    expect(src.sheet).not.toContain("SCAN_WITH_PRO");
  });

  it("swaps the word in a shared sentence, as the website's ProWords does", () => {
    expect(src.words).toContain("const parts = text.split(/\\bPro\\b/);");
    expect(src.words).toContain("{at > 0 ? <ProMark size={size} /> : null}");
  });
});
