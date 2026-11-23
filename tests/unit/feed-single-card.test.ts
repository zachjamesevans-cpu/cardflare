import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * A one-card post's card is no smaller than a many-card post's (the
 * founder: "it shrinks it compared to other cards ... look how weird it
 * looks in the feed"), and the details beside it open the card too.
 */
const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("a one-card post on the Feed", () => {
  it("draws its card at the strip's size in the app", () => {
    const pager = read("mobile/src/flare-deck-pager.tsx");
    expect(pager).toContain("cardWidth = STRIP_TILE,");
    expect(pager).toContain("export const STRIP_TILE = 108;");
  });

  it("opens the card from the details beside it, in the app and on the website", () => {
    const pager = read("mobile/src/flare-deck-pager.tsx");
    expect(pager).toContain("zoomRef={zoom}");
    expect(pager).toContain("onPress={() => zoom.current?.open()}");
    expect(read("mobile/src/ui.tsx")).toContain("useImperativeHandle(zoomRef,");

    const web = read("src/components/feed/flare-carousel.tsx");
    expect(web).toContain("onClick={openCard}");
    expect(web).toContain("aria-label={`View ${card.cardName}`}");
  });

  it("matches the website, where a single card is already the pager's size", () => {
    expect(read("src/components/feed/flare-feed-card.tsx")).toContain('size="pager"');
  });
});
