import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

/**
 * A Flare that named a printing shows THAT printing.
 *
 * The founder: "alts still aren't being shown in flare screen. it does
 * say it's selecting it, but when it goes to flare screen, it just
 * shows base rarity for all of them." Then the clue that found it: "it
 * does show properly in the hunts screen when added to a hunt, but main
 * menu feed doesn't show proper rarities."
 *
 * So the Flare knew which printing it meant the whole time, and hunts
 * drew it correctly. `cardFacts` resolves ONE image per card - whichever
 * printing row came back first - and the feed's decorating loop read the
 * chosen printing only to write its LABEL. The result was the worst of
 * both: "Alternate Art" printed over the base art.
 */
const read = (path: string) => readFile(path, "utf8");

describe("the feed draws the printing the Flare asked for", () => {
  it("takes the art from the chosen printing, not just its label", async () => {
    const repo = await read("src/lib/feed/repository.ts");
    const loop = repo.slice(repo.indexOf("const printing = card.printingId"));

    /* Both, and in this order: the label was already right, the picture
       was not. */
    expect(loop).toContain("card.printingLabel = printing");
    expect(loop).toContain(
      "if (printing?.imageUrl) card.imageUrl = printing.imageUrl;",
    );
  });

  it("keeps the card's own art when the printing has none", async () => {
    /*
     * A printing row without an image must not blank the tile - the
     * card's picture is a worse answer than the exact one and a much
     * better answer than nothing.
     */
    const repo = await read("src/lib/feed/repository.ts");
    const loop = repo.slice(repo.indexOf("const printing = card.printingId"));
    expect(loop).toContain("if (printing?.imageUrl)");
    expect(loop, "an unguarded assignment would blank arty-less printings").not.toMatch(
      /card\.imageUrl = printing\?\.imageUrl \?\? null/,
    );
  });

  it("still resolves one image per card for everything else", async () => {
    /*
     * `cardFacts` is right for what it is for: the items derived from
     * trades and binders hold a card id and nothing else. It is the
     * per-FLARE art that has a printing to honour, which is why the fix
     * belongs in the decorating loop rather than in the lookup.
     */
    const repo = await read("src/lib/feed/repository.ts");
    const facts = repo.slice(repo.indexOf("export async function cardFacts"));
    expect(facts.slice(0, 1200)).toContain('.select("card_id, image_url")');
  });
});
