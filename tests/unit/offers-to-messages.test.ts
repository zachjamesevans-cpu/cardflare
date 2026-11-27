import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

/*
 * The founder (2026-11-27), on Flare offers landing as a comment while
 * binder offers went to the pair's conversation: "do you think these
 * offers should go to messages going forward?", then "yes go".
 */
describe("an offer on a Flare goes to Messages", () => {
  const posts = read("src/lib/feed/posts.ts");
  const offer = posts.slice(posts.indexOf("export async function offerItems("));

  it("is a message carrying the cards, in the binder offer's words", () => {
    expect(offer).toContain("await sendCardsMessage(");
    expect(offer).toContain('binderOfferBody("Flare", named, note)');
    /* The comment and its own notice only for a guest's post. */
    expect(offer.indexOf("if (!threadId) {")).toBeLessThan(
      offer.indexOf("await writeComment("),
    );
    expect(offer).toContain("return { ok: true, offered, refused, threadId };");
  });

  it("View offer opens that conversation, on both platforms", () => {
    expect(read("mobile/src/screens/home.tsx")).toContain(
      "void openOfferThread(navigation, item.playerId)",
    );
    expect(read("mobile/src/view-offer.ts")).toContain("openDirectThread(playerId)");
    const zoom = read("src/components/cards/card-image-zoom.tsx");
    expect(zoom).toContain("openDirectThreadAction(have.posterId)");
    expect(zoom).toContain("/local?thread=");
  });
});
