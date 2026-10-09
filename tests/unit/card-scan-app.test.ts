import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

import * as app from "../../mobile/src/scan-copy";
import {
  CARD_ASPECT,
  frameInPhoto,
  guideFrame,
  scanResize,
} from "../../mobile/src/scan-frame";
import { scanHit, scanPrintingLabel } from "../../mobile/src/scan-hit";
import * as site from "@/lib/cards/scan-rules";
import { printingLabel, type CardPrinting } from "@/lib/cards/schema";

/**
 * The card scanner in the app. The founder (2026-10-09): card scanning,
 * a Pro feature "to cover the cost", tried by admins first. The app's
 * scanner is the website's: the same words, the same steps, the same
 * photo size, the same tray.
 *
 * Read off the source where it has to be: the app has no renderer in
 * the test run.
 */

const read = (path: string) =>
  readFileSync(resolve(import.meta.dirname, "../..", path), "utf8");
const flat = (text: string) => text.replace(/\s+/g, " ");

const src = {
  sheet: read("mobile/src/binder-add-sheet.tsx"),
  select: read("mobile/src/card-select.tsx"),
  scanner: read("mobile/src/card-scanner.tsx"),
  api: read("mobile/src/api.ts"),
};

describe("the words", () => {
  it("are the website's, every one", () => {
    const strings = Object.entries(site).filter(
      ([, value]) => typeof value === "string",
    );
    expect(strings.length).toBeGreaterThanOrEqual(10);
    for (const [name, value] of strings) {
      expect((app as Record<string, unknown>)[name], name).toBe(value);
    }
    expect(app.SCAN_REFUSALS).toEqual(site.SCAN_REFUSALS);
    expect(app.SCAN_LONG_EDGE).toBe(site.SCAN_LONG_EDGE);
    expect(app.SCAN_MAX_BYTES).toBe(site.SCAN_MAX_BYTES);
  });

  it("say what was read the same way", () => {
    for (const read of [
      { name: "Charizard ex", number: "199/165" },
      { name: "  Monkey.D.Luffy ", number: "" },
      { name: "", number: "OP01-001" },
      { name: "", number: "" },
    ]) {
      expect(app.scanReadLine(read)).toBe(site.scanReadLine(read));
    }
  });

  it("and the scan-copy file imports nothing, so it stays readable here", () => {
    expect(read("mobile/src/scan-copy.ts")).not.toMatch(/^import /m);
  });
});

describe("the entry in the binder's add menu", () => {
  it("is drawn only for the access the server gave", () => {
    /* Nothing until the server has said, so nothing appears and vanishes. */
    expect(src.sheet).toContain("useState<ScanAccess>(null)");
    expect(src.sheet).toContain("void getScanAccess()");
    expect(flat(src.sheet)).toContain(
      '...(scanAccess === "on" ? [["scan", SCAN_CARD] as const] : [])',
    );
    /* "pro-door" is the way to the Pro screen, in the website's words. */
    const door = src.sheet.slice(src.sheet.indexOf('scanAccess === "pro-door"'));
    expect(door).toContain('navigation.navigate("Pro");');
    expect(door).toContain("{SCAN_WITH_PRO}");
    /* And null is neither. */
    expect(src.sheet.match(/scanAccess ===/g)).toHaveLength(2);
    expect(src.api).toContain(
      'call<{ access?: ScanAccess }>("GET", "/api/v1/cards/scan")',
    );
  });

  it("sits beside Search and Paste a list, and the camera is its body", () => {
    expect(src.sheet).toContain('type Mode = "search" | "paste" | "scan";');
    expect(src.sheet).toContain(
      'body={mode === "paste" ? pasteBody : mode === "scan" ? scanBody : undefined}',
    );
  });

  it("adds into the menu's tray, through the menu's own button and route", () => {
    expect(src.sheet).toContain("onAdd={addScanned}");
    const add = src.sheet.slice(
      src.sheet.indexOf("const addScanned ="),
      src.sheet.indexOf("const less ="),
    );
    expect(add).toContain("setLines((current) =>");
    expect(add).toContain("quantity: Math.min(99, line.quantity + 1)");
    expect(add).toContain("quantity: 1,");
    expect(add).not.toContain("addBinderCards");
    /* The tray and its button are the scan's too. */
    expect(src.sheet).toContain('{mode !== "paste" && lines.length > 0 ? (');
    expect(src.scanner).not.toContain("addBinderCards");
  });

  it("puts a card it read but could not find into the search", () => {
    expect(src.scanner).toContain(
      "const name = outcome.read.englishName || outcome.read.name;",
    );
    expect(src.sheet).toContain("onNotFound={(text) => setSearchFor({ text })}");
    expect(src.sheet).toContain("searchFor={searchFor}");
    expect(src.select).toContain("if (searchFor) setQuery(searchFor.text);");
  });

  it("follows the website's steps in the website's words", () => {
    for (const word of [
      "{SCAN_HINT}",
      "label={TAKE_PHOTO}",
      "<Loading label={READING_CARD} />",
      "{IS_THIS_IT}",
      "{OTHER_MATCHES}",
      "label={ADD_TO_BINDER}",
      "label={SCAN_NEXT}",
      "label={SCAN_AGAIN}",
      "{SCAN_REFUSALS[step.reason]}",
      "reason: outcome.reason",
      "scanReadLine(step.read)",
    ]) {
      expect(src.scanner, word).toContain(word);
    }
    /* The printing the set code named is chosen from the start. */
    expect(src.scanner).toContain(
      "printingId: outcome.matches[0]?.printingId ?? null,",
    );
  });
});

describe("the photo", () => {
  it("is the frame's part, cut through the preview's fit", () => {
    const view = { width: 360, height: 480 };
    const frame = guideFrame(view.width, view.height);
    expect(frame.width / frame.height).toBeCloseTo(CARD_ASPECT, 5);
    expect(frame.x).toBeCloseTo((view.width - frame.width) / 2, 5);

    /* A 3:4 photo at three times the preview: a plain scale. */
    const crop = frameInPhoto(frame, view, { width: 1080, height: 1440 });
    expect(crop.width / crop.height).toBeCloseTo(CARD_ASPECT, 1);
    expect(crop.originX + crop.width).toBeLessThanOrEqual(1080);
    expect(crop.originY + crop.height).toBeLessThanOrEqual(1440);

    /* A taller photo is cut at top and bottom by the preview, so the
       crop moves down by what was cut. */
    const tall = frameInPhoto(frame, view, { width: 1080, height: 1920 });
    expect(tall.originY).toBeGreaterThan(crop.originY);
    expect(tall.originY + tall.height).toBeLessThanOrEqual(1920);
  });

  it("goes up at SCAN_LONG_EDGE on its long side", () => {
    expect(scanResize({ width: 2100, height: 2940 })).toEqual({
      height: site.SCAN_LONG_EDGE,
    });
    expect(scanResize({ width: 2940, height: 2100 })).toEqual({
      width: site.SCAN_LONG_EDGE,
    });
    /* Never larger than it was, as the website's scanSize. */
    expect(scanResize({ width: 500, height: 700 })).toEqual({ height: 700 });
  });

  it("is cropped and shrunk before it is sent", () => {
    expect(src.scanner).toContain("[{ crop }, { resize: scanResize(crop) }]");
    expect(src.scanner).toContain("format: SaveFormat.JPEG, base64: true");
    expect(src.scanner).toContain("let quality = 0.6;");
    const shoot = src.scanner.slice(src.scanner.indexOf("const shoot = async"));
    const shrunk = shoot.indexOf("await shrinkPhoto(photo, view)");
    const sent = shoot.indexOf("await scanCardPhoto(encoded");
    expect(shrunk).toBeGreaterThan(-1);
    expect(sent).toBeGreaterThan(shrunk);
  });

  it("travels in pieces of 6000 characters, one after another, where a body cannot", () => {
    /* The pieces are the avatar's and the scanner's both, one helper;
       the quick way and the fallback are pinned in page-scan-app.test.ts. */
    const upload = src.api.slice(
      src.api.indexOf("async function sendPieces("),
      src.api.indexOf("export async function uploadAvatar("),
    );
    const card = src.api.slice(
      src.api.indexOf("export async function scanCardPhoto("),
      src.api.indexOf("export async function scanPagePhotos("),
    );
    expect(card).toContain(
      "const total = await sendPieces(SCAN_PATH, uploadId, base64, onProgress);",
    );
    expect(upload).toContain("const CHUNK = 6000;");
    expect(upload).toContain("data: base64.slice(index * CHUNK, (index + 1) * CHUNK),");
    expect(upload).toMatch(
      /for \(let index = 0; index < total; index \+= 1\) \{\s+await call/,
    );
    expect(upload).not.toContain("Promise.all");
    expect(flat(src.api)).toContain('{ action: "read", uploadId, count: total }');
  });
});

describe("a scanned card reads like a searched one", () => {
  const printing = (over: Partial<CardPrinting>): CardPrinting => ({
    id: "p1",
    setCode: "OP01",
    setName: "Romance Dawn",
    printingLabel: null,
    variantType: null,
    rarity: "L",
    printingName: null,
    isPromo: null,
    imageUrl: null,
    ...over,
  });

  it("names every version in the website's words", () => {
    const name = "Kouzuki Oden";
    for (const p of [
      printing({}),
      printing({ printingName: "Kouzuki Oden (SPR)" }),
      printing({ printingName: "Kouzuki Oden (EB01-001) (Alternate Art)" }),
      printing({ variantType: "l", rarity: "L" }),
      printing({ isPromo: true, printingLabel: "Promo pack" }),
      printing({ setCode: null, rarity: null }),
    ]) {
      expect(scanPrintingLabel(p, name)).toBe(printingLabel(p, name));
    }
  });

  it("leads with the printing the scan pointed at", () => {
    const hit = scanHit(
      {
        id: "c1",
        exactName: "Kouzuki Oden",
        canonicalCardNumber: "EB01-001",
        cardType: "Leader",
        colors: ["Green"],
        cost: null,
        power: 5000,
        counter: null,
        life: 5,
        printings: [
          printing({ id: "a", imageUrl: "https://example.test/a.png" }),
          printing({ id: "b", imageUrl: "https://example.test/b.png" }),
        ],
      },
      "b",
    );
    expect(hit.basePrintingId).toBe("b");
    expect(hit.name).toBe("Kouzuki Oden");
    expect(hit.cardNumber).toBe("EB01-001");
  });
});

describe("the camera", () => {
  it("is asked for only by the code scanner and the card scanner", () => {
    const dir = resolve(import.meta.dirname, "../../mobile/src");
    const files = (folder: string): string[] =>
      readdirSync(folder, { withFileTypes: true }).flatMap((entry) =>
        entry.isDirectory()
          ? files(join(folder, entry.name))
          : /\.tsx?$/.test(entry.name)
            ? [join(folder, entry.name)]
            : [],
      );
    const asking = files(dir)
      .filter((file) =>
        /useCameraPermissions|requestCameraPermissionsAsync/.test(
          readFileSync(file, "utf8"),
        ),
      )
      .map((file) => file.slice(dir.length + 1).replace(/\\/g, "/"))
      .sort();
    expect(asking).toEqual(["card-scanner.tsx", "screens/scan.tsx"]);
  });

  it("is asked for when the scanner opens, which only a tap on Scan a card does", () => {
    expect(src.scanner).toContain("void requestPermission();");
    /* The scanner mounts only as the scan tab's body, and closing the
       menu leaves that tab, so reopening it never asks on its own. */
    expect(src.sheet).toContain('mode === "scan" ? scanBody');
    expect(src.sheet).toContain(
      'setMode((current) => (current === "scan" ? "search" : current));',
    );
    expect(src.sheet).toContain("onClose={close}");
  });

  it("says, in the purpose string, that it reads cards for a binder", () => {
    const config = JSON.parse(read("mobile/app.json")) as {
      expo: {
        ios: { infoPlist: Record<string, string> };
        plugins: (string | [string, Record<string, string>])[];
      };
    };
    const plugin = config.expo.plugins.find(
      (entry) => Array.isArray(entry) && entry[0] === "expo-camera",
    ) as [string, Record<string, string>];
    for (const why of [
      config.expo.ios.infoPlist.NSCameraUsageDescription,
      plugin[1].cameraPermission,
    ]) {
      expect(why).toContain("QR code");
      expect(why).toMatch(/cards/);
      expect(why).toContain("binder");
    }
  });
});
