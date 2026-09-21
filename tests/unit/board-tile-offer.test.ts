import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The board tile has no offer control of its own, and the Following
 * tab has no headings.
 *
 * The founder, on the handshake button under every tile whose stepper
 * opened over the art: "the small contextual menu that opens up over
 * the tiny card needs to go... just have people tap the card to open
 * full menu to say they have it or not." So the tile's art opens the
 * zoom, the zoom carries the offer form, and the only thing left under
 * a tile is Remove, on the viewer's own cards. Pinned here so the
 * button cannot come back on one platform.
 */

const ROOT = resolve(import.meta.dirname, "../..");
const read = (path: string) => readFileSync(resolve(ROOT, path), "utf8");

describe("the board tile", () => {
  const tile = read("src/components/lists/list-entries.tsx");

  it("no longer draws the handshake control or its stepper", () => {
    expect(existsSync(resolve(ROOT, "src/components/matching/quick-pledge.tsx"))).toBe(
      false,
    );
    expect(tile).not.toContain("QuickPledge");
    expect(tile).not.toContain("quick-pledge");
    expect(tile).not.toContain("the stepper opens over the art");
    /* The props the button needed went with it. */
    expect(tile).not.toContain("canOffer");
    expect(tile).not.toContain("ownQuantity");
  });

  it("hands the zoom the offer, so tapping the art is how you offer", () => {
    /* Every tile on the shelf carries its offer into the zoom. */
    expect(tile).toContain("offer={shelf[shelfAt.get(entry.id) ?? 0]?.offer ?? null}");
    expect(tile).toContain("offer={offer}");
    /* And the shelf builds one for every want that is not the viewer's. */
    expect(tile).toContain('!isYou && entry.intent !== "showcase"');
  });

  it("reserves the row under the art for Remove on your own tiles only", () => {
    const from = tile.indexOf(
      '{removable && !found && (\n        <div className="h-7">',
    );
    expect(from).toBeGreaterThan(-1);
    expect(tile.slice(from)).toContain('variant="tile"');
    /* Exactly one h-7 row, and it is inside the removable branch. */
    expect(tile.match(/className="h-7"/g)).toHaveLength(1);
  });

  it("says Offering, not Letting go, on the rail divider and headings", () => {
    expect(tile).not.toContain("Letting go");
    expect(tile).not.toContain("letting go");
    expect(tile).toContain('direction === "showcase" ? "Offering" : "Looking for"');
  });
});

describe("the Following tab", () => {
  it("draws no section headings, whatever the server sends", () => {
    const page = read("src/app/feed/page.tsx");
    expect(page).toContain(
      'tab === "following" ? 0 : new Set(shown.map((item) => item.section)).size',
    );
    expect(page).toContain("sectionsShown > 1 &&");
  });
});
