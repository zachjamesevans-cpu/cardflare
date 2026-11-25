import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

/*
 * The founder (2026-11-25): no Flares list under the composer; instead,
 * "when you ... already have a flare out for perona, and you happen to
 * click on that card, it'll have a logo or something when you search for
 * it that you already have it on your list." Any art marks a search
 * result; the sheet's pill follows the art on show; the composer's tile
 * flames a second Flare for the same card and art.
 */
describe("already on your Flares", () => {
  it("is held once in the app and fed by the composer's list", () => {
    const store = read("mobile/src/my-flares.ts");
    expect(store).toContain("export function cardFlared(");
    expect(store).toContain("export function artFlared(");
    expect(store).toContain(
      "want.printingId === null || printingIds.includes(want.printingId)",
    );
    expect(read("mobile/src/screens/hub.tsx")).toContain("setMyFlares(wants)");
  });

  /* "that little flare icon ... is awful ... maybe just a small rounded
     rectangle instead": a green "Flared" tag, not a round flame. */
  it("is a Flared tag, not a round icon", () => {
    const tag = read("mobile/src/flared-mark.tsx");
    expect(tag).toContain("export function FlaredTag(");
    expect(tag).not.toContain("export function FlaredMark(");
    expect(read("mobile/src/screens/search-lab.tsx")).toContain(
      '<FlaredTag style={{ position: "absolute", bottom: 5, right: 5 }} />',
    );
  });

  it("marks a search result, any art of it, on both platforms", () => {
    expect(read("mobile/src/screens/search-lab.tsx")).toContain(
      "{cardFlared(hit.id) ? (",
    );
    expect(read("src/components/feed/everything-search.tsx")).toContain(
      "flaredCardIds.includes(card.id)",
    );
  });

  it("puts On your Flares under a card's name for the art on show", () => {
    expect(read("mobile/src/screens/card.tsx")).toContain(
      "{onYourFlares ? <FlaredPill /> : null}",
    );
    expect(read("src/components/cards/card-page.tsx")).toContain("<FlaredArtPill");
    expect(read("src/lib/cards/card-page.ts")).toContain("wantedPrintings: [");
  });

  it("flames a composer tile already out", () => {
    expect(read("mobile/src/card-tray.tsx")).toContain("<FlaredTag small");
    expect(read("src/components/flares/flare-composer.tsx")).toContain(
      'aria-label="On your Flares"',
    );
  });
});
