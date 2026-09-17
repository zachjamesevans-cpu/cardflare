import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * The founder: "I am selecting the alt arts but it still only shows the
 * regular arts after flare is posted - and when clicking the card it
 * doesn't say alternate art."
 *
 * Two faults. The Feed's decorator attached the printing's label but
 * left the picture as the card's first printing, so an alternate art
 * drew as base art. And the compact card's zoom was handed no caption,
 * so the tap said nothing about which version it was.
 */
const read = (path: string) => readFileSync(resolve(__dirname, "../..", path), "utf8");

describe("the Feed draws the version that was chosen", () => {
  it("a chosen printing brings its own picture", () => {
    const repo = read("src/lib/feed/repository.ts");
    const decorate = repo.slice(repo.indexOf("async function decorateHunts"));
    expect(decorate).toContain(
      "if (printing?.imageUrl) card.imageUrl = printing.imageUrl;",
    );
  });

  it("the compact card's zoom says which version", () => {
    const compact = read("src/components/feed/flare-feed-card-compact.tsx");
    expect(compact).toContain("caption: card.printingLabel ?? null");
    expect(compact).toContain("anyPrinting: !card.printingId");
  });

  it("the full card's zoom already did", () => {
    const full = read("src/components/feed/flare-feed-card.tsx");
    expect(full).toContain("caption: card.printingLabel ?? null");
    expect(full).toContain("anyPrinting: !card.printingId");
  });
});
