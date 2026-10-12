import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { foundLast } from "@/lib/feed/card-copy";

/**
 * The founder (2026-10-12): "when viewing a card in full view, it
 * should still show that the card was found, and with the green 'found'
 * thing at bottom. also, cards that are found should go all the way to
 * the right of the feed once they are found."
 */

const root = path.resolve(__dirname, "../..");
const read = (file: string) => readFileSync(path.join(root, file), "utf8");

describe("found cards at the far right", () => {
  it("sorts found last and keeps the open ones in posted order", () => {
    const cards = [
      { id: "a", state: "open" },
      { id: "b", state: "found" },
      { id: "c", state: "offered" },
      { id: "d", state: "found" },
      { id: "e", state: "open" },
    ];
    expect([...cards].sort(foundLast).map((card) => card.id)).toEqual([
      "a",
      "c",
      "e",
      "b",
      "d",
    ]);
  });

  it("is the same rule in the app", () => {
    const app = read("mobile/src/found-last.ts");
    expect(app).toContain('Number(a.state === "found") - Number(b.state === "found")');
  });

  /* The server sends them in order, but a card ticked on this phone, a
     cached Feed and demo mode never pass back through it. */
  it("is applied where every Feed post is drawn, on both platforms", () => {
    for (const file of [
      "mobile/src/flare-feed-card.tsx",
      "mobile/src/flare-feed-card-compact.tsx",
      "src/components/feed/flare-feed-card.tsx",
      "src/components/feed/flare-feed-card-compact.tsx",
    ]) {
      const source = read(file);
      expect(source, file).toContain("const cards = [...item.cards].sort(foundLast);");
      expect(source, file).not.toMatch(/item\.cards\.map\(/);
    }
  });
});

describe("found in the full view", () => {
  it("carries the card's state into the viewer", () => {
    for (const file of [
      "mobile/src/flare-deck-pager.tsx",
      "mobile/src/card-rail.tsx",
      "src/components/feed/flare-feed-card.tsx",
      "src/components/feed/flare-feed-card-compact.tsx",
      "src/components/feed/feed-tile.tsx",
    ]) {
      expect(read(file), file).toContain('state: card.state ?? "open"');
    }
    expect(read("mobile/src/hunt-binder.tsx")).toContain(
      'state: done ? "found" : "open"',
    );
    expect(read("src/components/players/hunt-binder.tsx")).toContain(
      'state: card.found ? "found" : "open"',
    );
  });

  it("draws the found card in black and white with the green band", () => {
    const app = read("mobile/src/ui.tsx");
    expect(app).toContain("<StateBand state={state} large />");
    expect(app).toMatch(/state === "found" \? \(\s*<FoundArt/);
    expect(app.match(/<ZoomArt/g)?.length).toBe(2);
    const web = read("src/components/cards/card-image-zoom.tsx");
    expect(web).toContain('"opacity-60 grayscale"');
    expect(web).toContain(
      'cardState === "found"\n                    ? "bg-accent text-accent-contrast"',
    );
  });
});
