import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

import * as rules from "@/lib/cards/scan-rules";

/**
 * The card scanner on the website, in the binder's Add cards sheet.
 *
 * The founder (2026-10-09): card scanning as a Pro feature, "to cover
 * the cost", tried by admins first. A photo is read by a model, our
 * catalogue finds the card, and the player confirms. The app's twin is
 * pinned in card-scan-app.test.ts; the words are scan-rules.ts on both.
 */

/* The component imports the Server Action; the test never calls it. */
vi.mock("@/lib/cards/scan-actions", () => ({
  scanCardAction: vi.fn(),
  scannerAccessAction: vi.fn(),
}));

const read = (path: string) =>
  readFileSync(resolve(import.meta.dirname, "../..", path), "utf8");

const scan = read("src/components/cards/scan-card.tsx");
const add = read("src/components/binder/add-binder-card.tsx");
const picker = read("src/components/binder/binder-picker.tsx");
const view = read("src/components/binder/binder-page.tsx");
const ownPage = read("src/app/profile/binders/[binderId]/page.tsx");
const publicBinder = read("src/components/binder/public-binder.tsx");
const search = read("src/components/cards/card-search.tsx");

/** The code alone: a comment may quote a word, the code may not retype it. */
const code = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/** Every word scan-rules.ts exports, by its name. */
const WORDS = Object.entries(rules as Record<string, unknown>).filter(
  (entry): entry is [string, string] => typeof entry[1] === "string",
);

describe("the scan entry is drawn by the server's answer", () => {
  it("is read on the server with the page, never fetched after it draws", () => {
    expect(ownPage).toContain('import { scannerAccess } from "@/lib/cards/scan";');
    expect(ownPage).toContain("scannerAccess({ playerId, userId: viewer.user.id })");
    expect(ownPage).toContain("scanAccess={scanAccess}");
    /* The owner arriving by their own public link gets the same tools. */
    expect(publicBinder).toContain(
      "scannerAccess({ playerId: me, userId: viewer.user.id })",
    );
    expect(publicBinder).toMatch(/binder\.yours && me && viewer\.kind !== "anonymous"/);
    expect(view).toContain("scanAccess={scanAccess}");
    /* No client round trip, so no button that appears and then goes. */
    for (const source of [add, scan, view]) {
      expect(source).not.toContain("scannerAccessAction");
    }
  });

  it("draws nothing for null, the scanner for on, the Pro door for pro-door", () => {
    expect(add).toContain('scanAccess?: "on" | "pro-door" | null;');
    expect(add).toContain("scanAccess = null,");
    expect(view).toContain("scanAccess = null,");
    /* The scan tab exists only when the answer is "on". */
    expect(add).toContain(
      '...(scanAccess === "on" ? ([["scan", SCAN_CARD]] as const) : []),',
    );
    expect(add).toMatch(/\) : tab === "scan" \? \(/);
    /* The way to Pro only for "pro-door", and it goes to /pro. */
    expect(add).toContain('{scanAccess === "pro-door" && <ScanWithPro />}');
    expect(scan).toMatch(
      /<Link\s+href="\/pro"[^>]*>\s*<ScanLine[^>]*\/>\s*\{SCAN_WITH_PRO\}/,
    );
    /* Nothing else mentions the scanner, so null leaves no trace. */
    expect(add.match(/<ScanCard\b/g)).toHaveLength(1);
    expect(add.match(/<ScanWithPro\b/g)).toHaveLength(1);
  });
});

describe("the photo is shrunk in the browser before it is sent", () => {
  it("draws the long side at SCAN_LONG_EDGE and never enlarges", async () => {
    const { scanSize } = await import("@/components/cards/scan-card");
    expect(scanSize(4032, 3024)).toEqual({ width: rules.SCAN_LONG_EDGE, height: 768 });
    expect(scanSize(3024, 4032)).toEqual({ width: 768, height: rules.SCAN_LONG_EDGE });
    expect(scanSize(800, 600)).toEqual({ width: 800, height: 600 });
    expect(scanSize(0, 0)).toEqual({ width: 1, height: 1 });
  });

  it("shrinks to a JPEG under SCAN_MAX_BYTES, then sends that and only that", () => {
    expect(scan).toContain(
      "const size = scanSize(image.naturalWidth, image.naturalHeight);",
    );
    expect(scan).toContain("context.drawImage(image, 0, 0, size.width, size.height);");
    expect(scan).toContain('canvas.toBlob(done, "image/jpeg", quality)');
    expect(scan).toContain("if (blob && blob.size <= SCAN_MAX_BYTES) return blob;");
    expect(scan).toContain("const QUALITIES = [0.85, 0.7, 0.55] as const;");
    const shrink = scan.indexOf("photo = await shrinkPhoto(file);");
    const append = scan.indexOf('form.append("photo", photo, "card.jpg");');
    const send = scan.indexOf("outcome = await scanCardAction(form);");
    expect(shrink).toBeGreaterThan(-1);
    expect(append).toBeGreaterThan(shrink);
    expect(send).toBeGreaterThan(append);
    expect(scan).not.toContain('form.append("photo", file');
  });

  it("opens the camera only from the Take photo button", () => {
    expect(scan).toContain('accept="image/*"');
    expect(scan).toContain('capture="environment"');
    expect(scan.match(/input\.current\?\.click\(\)/g)).toHaveLength(1);
    expect(scan).toMatch(/onClick=\{\(\) => input\.current\?\.click\(\)\}>\s*<Camera/);
    expect(scan).not.toContain("useEffect");
  });
});

describe("a scanned card goes in the tray, by the existing add path", () => {
  it("lands through the search's own pick, with the composer's draft rules", () => {
    expect(add).toMatch(/<ScanCard\s+imagesEnabled=\{imagesEnabled\}\s+onAdd=\{pick\}/);
    expect(add).toContain("onAdd={pick}\n");
    expect(add).toContain("setPicks((current) => addCard(current, card, printing));");
    /* The tray it fills is the one the search fills, shown over the camera. */
    expect(add).toContain("<BinderTray");
    expect(picker).toContain("export function BinderTray(");
    expect(picker).toMatch(/<BinderTray\s/);
    /* The sheet's one Add button commits the tray on the scan tab too. */
    expect(add).toMatch(/const items =\s+tab !== "paste"\s+\? picks\.map/);
    expect(add).toContain('{tab !== "paste" || preview ? (');
  });

  it("never opens a new server path: the read is the only call it makes", () => {
    expect(scan).not.toContain("addBinderCardsAction");
    expect(scan).not.toContain("@/lib/binder/");
    expect(scan).not.toContain("fetch(");
    expect(scan).toContain(
      'import { scanCardAction } from "@/lib/cards/scan-actions";',
    );
  });

  it("adds, then offers the next card, as the app's scan screen does", () => {
    expect(scan).toMatch(
      /\{!step\.added && \(\s*<Button[^>]*onClick=\{onAdd\}>\s*\{ADD_TO_BINDER\}/,
    );
    expect(scan).toContain('variant={step.added ? "primary" : "secondary"}');
    expect(scan).toMatch(/onClick=\{onAgain\}\s*>\s*\{SCAN_NEXT\}/);
    expect(scan).toContain('const again = () => setStep({ kind: "ready" });');
  });

  it("preselects the suggested printing and lets another guess swap in", () => {
    expect(scan).toContain("printingId: top.printingId,");
    expect(scan).toContain("printingId: step.matches[at]?.printingId ?? null,");
    /* Tapped again, the chosen printing lets go: any printing. */
    expect(scan).toContain("onClick={() => onPrinting(on ? null : printing.id)}");
    expect(scan).toContain("(each) => each.id === step.printingId");
    expect(scan).toContain(".filter(({ at }) => at !== step.at);");
  });

  it('hands a card read but "not-found" to the search by its English name first', () => {
    expect(scan).toContain('if (reason === "not-found" && outcome.read) {');
    expect(scan).toContain(
      "const name = outcome.read.englishName || outcome.read.name;",
    );
    expect(add).toContain("onNotFound={setLookFor}");
    expect(add).toContain("initialQuery={lookFor}");
    expect(picker).toContain("initialQuery={initialQuery}");
    expect(search).toContain("const [query, setQuery] = useState(initialQuery);");
  });
});

describe("every word is scan-rules.ts", () => {
  it("imports the words and never retypes one", () => {
    const shown = [
      "SCAN_CARD",
      "SCAN_HINT",
      "TAKE_PHOTO",
      "READING_CARD",
      "IS_THIS_IT",
      "OTHER_MATCHES",
      "ADD_TO_BINDER",
      "SCAN_NEXT",
      "SCAN_AGAIN",
      "SCAN_WITH_PRO",
    ];
    for (const name of shown) {
      expect(scan, name).toMatch(new RegExp(`\\{${name}\\}`));
    }
    expect(scan).toContain("{SCAN_REFUSALS[step.reason]}");
    expect(scan).toContain("const line = scanReadLine(step.read);");
    expect(add).toContain('import { SCAN_CARD } from "@/lib/cards/scan-rules";');
    for (const [name, word] of WORDS) {
      for (const source of [code(scan), code(add)]) {
        expect(source, name).not.toContain(`"${word}"`);
      }
    }
    for (const word of Object.values(rules.SCAN_REFUSALS)) {
      expect(code(scan)).not.toContain(word);
    }
  });

  it("waits on the site's one spinner", () => {
    expect(scan).toContain('import { Spinner } from "@/components/ui/spinner";');
    expect(scan).toMatch(/<Spinner size="lg" \/>\s*<p[^>]*>\{READING_CARD\}<\/p>/);
  });
});
