import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Two founder asks, swept across everything outside the binder and the
 * Flare composer's picker, on both platforms.
 *
 * One quantity tag: "I like how there's the small black quantity amount
 * in the binder too... Adopt that to all other quantities I select." So
 * a count of copies drawn on or beside a card is QuantityBadge, never a
 * hand-rolled "×2" span. Sentences that count in words stay words, and
 * steppers stay steppers.
 *
 * No "Looking for" on cards: "Delete the 'looking for' part on all
 * cards. Seems kinda redundant when they know it's for flares." A want
 * wears no label; a showcase keeps a small "Offering" chip, so a mixed
 * grid still tells the two apart.
 */

const ROOT = resolve(import.meta.dirname, "../..");
const read = (path: string) => readFileSync(resolve(ROOT, path), "utf8");

const WEB_BADGE = 'import { QuantityBadge } from "@/components/ui/quantity-badge";';

const webTagged = [
  "src/components/players/profile-flares.tsx",
  "src/components/lists/list-entries.tsx",
  "src/components/trades/traded-tonight.tsx",
  "src/components/trades/history.tsx",
  "src/components/local/local-screen.tsx",
  "src/components/shows/vendor-inventory-list.tsx",
  "src/components/admin/store-detail.tsx",
  "src/components/shows/show-search.tsx",
  "src/components/players/deck-list-form.tsx",
];

const appTagged: [string, string][] = [
  [
    "mobile/src/profile-flares.tsx",
    'import { QuantityBadge } from "./quantity-badge";',
  ],
  ["mobile/src/trade-history.tsx", 'import { QuantityBadge } from "./quantity-badge";'],
  ["mobile/src/screens/room.tsx", 'import { QuantityBadge } from "../quantity-badge";'],
  [
    "mobile/src/screens/local.tsx",
    'import { QuantityBadge } from "../quantity-badge";',
  ],
  [
    "mobile/src/screens/settings.tsx",
    'import { QuantityBadge } from "../quantity-badge";',
  ],
];

/** The code without its comments, so a remark about "×2" is not a tag. */
function code(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

describe("one quantity tag", () => {
  it("is imported and drawn by every surface that counts copies on a card", () => {
    for (const path of webTagged) {
      const source = read(path);
      expect(source, path).toContain(WEB_BADGE);
      expect(source, path).toContain("<QuantityBadge");
    }
    for (const [path, line] of appTagged) {
      const source = read(path);
      expect(source, path).toContain(line);
      expect(source, path).toContain("<QuantityBadge");
    }
  });

  it("leaves no hand-rolled ×N tag behind", () => {
    /* A visible "×" in markup, outside a sentence or a screen-reader
       line, is the old tag. */
    const tagLike = /className="(?!sr-only)[^"]*"\s*>\s*×\{|>\s*\{`×\$\{/;
    for (const path of [...webTagged, ...appTagged.map(([path]) => path)]) {
      expect(code(read(path)), path).not.toMatch(tagLike);
    }
    /* The app's board tile and its own little chip style. */
    const room = read("mobile/src/screens/room.tsx");
    expect(room).not.toContain("countBadge");
    expect(room).toMatch(/<QuantityBadge\s+quantity=\{visible\}/);
    /* The website's board tile counts down with the fan, the same way. */
    const board = read("src/components/lists/list-entries.tsx");
    expect(board).toMatch(/<QuantityBadge\s+quantity=\{visible\}/);
    expect(board).not.toContain("text-[10px] font-bold text-text-primary tabular-nums");
  });

  it("puts a trade's count on its card's corner on both platforms", () => {
    const web = read("src/components/trades/history.tsx");
    const app = read("mobile/src/trade-history.tsx");
    expect(web).toContain("absolute top-0.5 left-0.5");
    expect(app).toContain('style={{ position: "absolute", top: 2, left: 2 }}');
    expect(app).not.toContain("` ×${trade.quantity}`");
  });

  it("tags a profile Flare in the top-left corner, like the binder", () => {
    expect(read("src/components/players/profile-flares.tsx")).toContain(
      "absolute top-1 left-1",
    );
    expect(read("mobile/src/profile-flares.tsx")).toContain(
      'style={{ position: "absolute", top: 4, left: 4 }}',
    );
  });
});

describe("no Looking for on cards", () => {
  const swept = [
    "src/components/players/profile-flares.tsx",
    "mobile/src/profile-flares.tsx",
    "src/components/feed/feed-items.tsx",
    "mobile/src/screens/home.tsx",
    "src/components/local/local-screen.tsx",
    "mobile/src/screens/local.tsx",
    "mobile/src/screens/night-player.tsx",
  ];

  it("labels no want, on either platform", () => {
    for (const path of swept) {
      const source = code(read(path));
      expect(source, path).not.toMatch(/"Looking for"|>\s*Looking for\b/);
      expect(source, path).not.toContain('"Hunting"');
      expect(source, path).not.toContain('"Trading away"');
    }
  });

  it("keeps the Offering chip on a showcase", () => {
    for (const path of swept) {
      expect(read(path), path).toContain("Offering");
    }
    for (const path of [
      "src/components/players/profile-flares.tsx",
      "mobile/src/profile-flares.tsx",
    ]) {
      const source = read(path);
      /* Drawn only when the Flare is not a want. */
      expect(source, path).toMatch(/direction === "want" \? null|want \? null/);
    }
    for (const path of [
      "src/components/feed/feed-items.tsx",
      "mobile/src/screens/home.tsx",
    ]) {
      expect(read(path), path).toContain(
        'item.direction === "showcase" ? "Offering" : null',
      );
    }
  });

  it("says Offering, not Letting go, in the card viewer on both platforms", () => {
    const web = read("src/components/cards/card-image-zoom.tsx");
    expect(web).toContain('"Offering this"');
    expect(web).toContain("`Offering ${lookingFor}`");
    expect(web).not.toContain("Letting this go");
    expect(read("mobile/src/ui.tsx")).toContain('"Offering this"');
  });
});
