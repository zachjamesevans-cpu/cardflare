import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

import * as rules from "@/lib/cards/scan-rules";

/**
 * The card scanner on the website, opened from the binder's Add cards
 * sheet.
 *
 * The founder (2026-10-09): card scanning "to cover the cost", free
 * singles up to ten a day and Pro without a limit. A photo is read by a
 * model, our catalogue finds the card, and the player confirms. The one
 * scanner, the card viewer and the PRO mark are pinned in
 * scan-ux-web.test.ts; the app's twin is card-scan-app.test.ts; the
 * words are scan-rules.ts on both.
 */

/* The component imports the Server Action; the test never calls it. */
vi.mock("@/lib/cards/scan-actions", () => ({
  scanCardAction: vi.fn(),
  scannerAccessAction: vi.fn(),
  scanRightsAction: vi.fn(),
}));

const read = (path: string) =>
  readFileSync(resolve(import.meta.dirname, "../..", path), "utf8");

const scan = read("src/components/cards/scan-card.tsx");
const scanner = read("src/components/cards/scanner.tsx");
const viewer = read("src/components/cards/card-viewer.tsx");
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
    expect(ownPage).toContain('import { scanRights } from "@/lib/cards/scan";');
    expect(ownPage).toContain("scanRights({ playerId, userId: viewer.user.id })");
    expect(ownPage).toContain("scanRights={rights}");
    /* The owner arriving by their own public link gets the same tools. */
    expect(publicBinder).toContain(
      "scanRights({ playerId: me, userId: viewer.user.id })",
    );
    expect(publicBinder).toMatch(/binder\.yours && me && viewer\.kind !== "anonymous"/);
    expect(view).toContain("rights={scanRights}");
    /* No client round trip for the button, so no button that appears and then goes. */
    for (const source of [add, scan, view, scanner]) {
      expect(source).not.toContain("scannerAccessAction");
      expect(source).not.toContain("scannerAccess(");
    }
  });

  it("draws Scan only when single cards are on or used up, and nothing for null", () => {
    expect(add).toContain("rights?: ScanRights | null;");
    expect(add).toContain("rights = null,");
    expect(view).toContain("scanRights = null,");
    expect(add).toContain("const scans = rights !== null && rights.singles !== null;");
    expect(add).toMatch(/\{scans && \(\s*<Button/);
    /* The scanner itself only with rights to scan with. */
    expect(add).toContain("{scanning && rights && (");
    expect(add.match(/<Scanner\b/g)).toHaveLength(1);
    /* The old door is gone: the scanner's own Pro screen is the way to Pro. */
    expect(add).not.toContain("ScanWithPro");
    expect(scan).not.toContain("ScanWithPro");
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
    expect(scanner).toContain('accept="image/*"');
    expect(scanner).toContain('capture="environment"');
    expect(scanner.match(/input\.current\?\.click\(\)/g)).toHaveLength(1);
    expect(scanner).toMatch(
      /onClick=\{\(\) => input\.current\?\.click\(\)\}\s*>\s*<Camera[^>]*\/>\s*\{retake \? takePageLabel\(retake\.page\) : TAKE_PHOTO\}/,
    );
    expect(scanner).not.toMatch(/useEffect\(\(\) => \{\s*input/);
  });
});

describe("a scanned card goes in the tray, by the existing add path", () => {
  it("lands through the search's own pick, with the composer's draft rules", () => {
    expect(add).toMatch(/<Scanner[\s\S]*?onAdd=\{pick\}/);
    expect(add).toContain("setPicks((current) => addCard(current, card, printing));");
    /* The tray it fills is the one the search fills. */
    expect(picker).toContain("<BinderTray");
    expect(picker).toContain("export function BinderTray(");
    /* The sheet's one Add button commits the tray, scanned cards and all. */
    expect(add).toMatch(/const items =\s+view === "search"\s+\? picks\.map/);
    expect(add).toContain('{view === "search" || preview ? (');
  });

  it("never opens a new server path: the read is the only call it makes", () => {
    expect(scan).not.toContain("addBinderCardsAction");
    expect(scan).not.toContain("@/lib/binder/");
    expect(scan).not.toContain("fetch(");
    expect(scanner).not.toContain("addBinderCardsAction");
    expect(scan).toContain(
      'import { scanCardAction } from "@/lib/cards/scan-actions";',
    );
  });

  it("adds with That's it, then the camera is back for the next card", () => {
    const confirm = scanner.slice(scanner.indexOf("onConfirm={() => {"));
    expect(confirm).toMatch(/^onConfirm=\{\(\) => \{[\s\S]*?onAdd\([\s\S]*?again\(\);/);
    expect(scanner).toContain('setStep({ kind: "camera" });');
  });

  it("preselects the suggested printing and lets another guess or printing swap in", () => {
    expect(scanner).toContain(
      "choice: { card: top.card, printingId: top.printingId },",
    );
    /* Tapped again, the chosen printing lets go: any printing. */
    expect(scan).toContain("onClick={() => onPrinting(on ? null : printing.id)}");
    expect(scanner).toContain(
      "choice.card.printings.find((each) => each.id === choice.printingId)",
    );
    expect(viewer).toContain(
      "const others = item.matches.filter((match) => match.card.id !== choice?.card.id);",
    );
  });

  it('hands a card read but "not-found" to the search by its English name first', () => {
    expect(scanner).toContain(
      'if (reason === "not-found" && !answer.ok && answer.read) {',
    );
    expect(scanner).toContain(
      "const name = answer.read.englishName || answer.read.name;",
    );
    expect(add).toMatch(/onNotFound=\{\(name\) => \{\s*setLookFor\(name\);/);
    expect(add).toContain("initialQuery={lookFor}");
    /* Remade with the name, since the search reads it once, on mount. */
    expect(add).toContain("key={lookFor}");
    expect(picker).toContain("initialQuery={initialQuery}");
    expect(search).toContain("const [query, setQuery] = useState(initialQuery);");
  });
});

describe("every word is scan-rules.ts", () => {
  it("imports the words and never retypes one", () => {
    expect(scanner).toContain("{retake ? takePageLabel(retake.page) : TAKE_PHOTO}");
    for (const name of [
      "READING_CARD",
      "SCAN_AGAIN",
      "SCAN_TITLE",
      "SCAN_INTRO_SINGLE",
      "SCAN_INTRO_PAGES",
      "FILL_THE_FRAME",
      "GET_PRO",
      "DONE_SCANNING",
    ]) {
      expect(scanner, name).toMatch(new RegExp(`\\{${name}\\}`));
    }
    expect(scanner).toContain('{ kind: "refused", line: SCAN_REFUSALS[reason] }');
    expect(add).toContain(
      'import { READING_IN_BACKGROUND, SCAN_TITLE } from "@/lib/cards/scan-rules";',
    );
    for (const [name, word] of WORDS) {
      for (const source of [code(scan), code(add), code(scanner), code(viewer)]) {
        expect(source, name).not.toContain(`"${word}"`);
        expect(source, name).not.toContain(`>${word}<`);
      }
    }
    for (const word of Object.values(rules.SCAN_REFUSALS)) {
      expect(code(scan)).not.toContain(word);
      expect(code(scanner)).not.toContain(word);
    }
  });

  it("waits on the site's one spinner", () => {
    expect(scanner).toContain('import { Spinner } from "@/components/ui/spinner";');
    expect(scanner).toMatch(/<Spinner size="lg" \/>\s*<p[^>]*>\{READING_CARD\}<\/p>/);
  });
});
