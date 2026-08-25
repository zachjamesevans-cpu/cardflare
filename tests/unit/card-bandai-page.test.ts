import { describe, expect, it } from "vitest";

import {
  discoverReport,
  htmlToText,
  imageFileName,
  impliedSetCode,
  parallelLabel,
  parseBandaiCardlist,
  parseSeriesTitle,
  splitSlug,
  toImportManifest,
} from "@/lib/cards/bandai-page";
import {
  classificationColumns,
  classificationOf,
  PRINTING_CLASSIFICATIONS,
} from "@/lib/cards/classify";
import { importManifestSchema } from "@/lib/cards/import-schema";
import { printingLabel } from "@/lib/cards/schema";

/**
 * The Bandai card list, as the parser understands it.
 *
 * The fixture below is the markup shape the parser is written against:
 * one `<dl class="modalCol">` per printing, an `infoCol` header of
 * number | rarity | category, and `<h3>`-labelled value blocks. The
 * parser keys on the LABELS, so a class rename on Bandai's side changes
 * nothing here — but a label rename would, and this fixture is where
 * that contract is pinned. When the real page drifts, the collector's
 * discover mode reports empty fields BEFORE anything imports, the
 * founder sends over a saved copy of the page, and this fixture gets
 * corrected against what the page really looks like.
 *
 * Three printings, chosen to cover the shapes that differ:
 * - a LEADER, whose cost slot is labelled "Life" instead of "Cost";
 * - a CHARACTER with a trigger, a two-colour identity, and an effect
 *   split across `<br>`s with an entity in its text;
 * - the same character again as a `_p1` parallel with a lazy-loaded
 *   image, the way the site marks an alternate art without saying so.
 */
const PAGE = `
<html><body>
<select name="series">
  <option value="569117" selected>ROYAL BLOOD [OP-14]</option>
  <option value="569101">THE FUTURE [OP-13]</option>
</select>

<dl class="modalCol" id="OP14-001">
  <dt>
    <div class="infoCol"><span>OP14-001</span> | <span>L</span> | <span>LEADER</span></div>
    <div class="cardName">Shanks</div>
  </dt>
  <dd>
    <div class="frontCol"><img src="../images/cardlist/card/OP14-001.png?250801" alt="Shanks"></div>
    <div class="backCol">
      <div class="col2">
        <div class="cost"><h3>Life</h3>4</div>
        <div class="attribute"><h3>Attribute</h3><i>Slash</i><img src="../images/cardlist/attribute/ico_type01.png"></div>
      </div>
      <div class="col2">
        <div class="power"><h3>Power</h3>5000</div>
        <div class="counter"><h3>Counter</h3>-</div>
      </div>
      <div class="color"><h3>Color</h3>Red</div>
      <div class="feature"><h3>Type</h3>The Four Emperors/Red-Haired Pirates</div>
      <div class="text"><h3>Effect</h3>[Activate: Main] [Once Per Turn] Give up to 1 of your opponent&#39;s Characters &minus;1000 power during this turn.</div>
      <div class="getInfo"><h3>Card Set(s)</h3>-ROYAL BLOOD- [OP-14]</div>
    </div>
  </dd>
</dl>

<dl class="modalCol" id="OP14-029">
  <dt>
    <div class="infoCol"><span>OP14-029</span> | <span>SR</span> | <span>CHARACTER</span></div>
    <div class="cardName">Portgas.D.Ace</div>
  </dt>
  <dd>
    <div class="frontCol"><img src="../images/cardlist/card/OP14-029.png?250801" alt="Ace"></div>
    <div class="backCol">
      <div class="col2">
        <div class="cost"><h3>Cost</h3>7</div>
        <div class="attribute"><h3>Attribute</h3><i>Special</i></div>
      </div>
      <div class="col2">
        <div class="power"><h3>Power</h3>7000</div>
        <div class="counter"><h3>Counter</h3>1000</div>
      </div>
      <div class="color"><h3>Color</h3>Red/Green</div>
      <div class="feature"><h3>Type</h3>Whitebeard Pirates</div>
      <div class="text"><h3>Effect</h3>[On Play] K.O. up to 1 of your opponent&#39;s Characters with a cost of 4 or less.<br>[Trigger] Play this card.</div>
      <div class="trigger"><h3>Trigger</h3>Play this card.</div>
      <div class="getInfo"><h3>Card Set(s)</h3>-ROYAL BLOOD- [OP-14]</div>
    </div>
  </dd>
</dl>

<dl class="modalCol" id="OP14-029_p1">
  <dt>
    <div class="infoCol"><span>OP14-029</span> | <span>SR</span> | <span>CHARACTER</span></div>
    <div class="cardName">Portgas.D.Ace</div>
  </dt>
  <dd>
    <div class="frontCol"><img src="lazy.gif" data-src="../images/cardlist/card/OP14-029_p1.png?250801" alt="Ace"></div>
    <div class="backCol">
      <div class="col2">
        <div class="cost"><h3>Cost</h3>7</div>
        <div class="attribute"><h3>Attribute</h3><i>Special</i></div>
      </div>
      <div class="col2">
        <div class="power"><h3>Power</h3>7000</div>
        <div class="counter"><h3>Counter</h3>1000</div>
      </div>
      <div class="color"><h3>Color</h3>Red/Green</div>
      <div class="feature"><h3>Type</h3>Whitebeard Pirates</div>
      <div class="text"><h3>Effect</h3>[On Play] K.O. up to 1 of your opponent&#39;s Characters with a cost of 4 or less.<br>[Trigger] Play this card.</div>
      <div class="trigger"><h3>Trigger</h3>Play this card.</div>
      <div class="getInfo"><h3>Card Set(s)</h3>-ROYAL BLOOD- [OP-14]</div>
    </div>
  </dd>
</dl>
</body></html>
`;

const PAGE_URL = "https://en.onepiece-cardgame.com/cardlist/?series=569117";

describe("parsing the Bandai card list", () => {
  const cards = parseBandaiCardlist(PAGE, PAGE_URL);

  it("finds every printing, parallels included", () => {
    expect(cards.map((card) => card.slug)).toEqual([
      "OP14-001",
      "OP14-029",
      "OP14-029_p1",
    ]);
  });

  it("reads a leader: Life in the cost slot, a dash as no counter", () => {
    const shanks = cards[0];
    expect(shanks.cardNumber).toBe("OP14-001");
    expect(shanks.name).toBe("Shanks");
    expect(shanks.rarity).toBe("L");
    expect(shanks.cardType).toBe("Leader");
    expect(shanks.life).toBe(4);
    expect(shanks.cost).toBeNull();
    expect(shanks.power).toBe(5000);
    expect(shanks.counter).toBeNull();
    expect(shanks.colors).toEqual(["red"]);
    expect(shanks.attribute).toBe("Slash");
    expect(shanks.traits).toEqual(["The Four Emperors", "Red-Haired Pirates"]);
  });

  it("decodes entities and keeps effect line structure", () => {
    expect(cards[0].effectText).toBe(
      "[Activate: Main] [Once Per Turn] Give up to 1 of your opponent's Characters −1000 power during this turn.",
    );
    expect(cards[1].effectText).toContain("opponent's Characters");
    expect(cards[1].effectText).toContain("\n[Trigger] Play this card.");
    expect(cards[1].triggerText).toBe("Play this card.");
  });

  it("splits a two-colour identity the way the sync stores colours", () => {
    expect(cards[1].colors).toEqual(["red", "green"]);
  });

  it("marks the parallel and keeps the printed number shared", () => {
    const parallel = cards[2];
    expect(parallel.parallel).toBe(1);
    expect(parallel.cardNumber).toBe("OP14-029");
    expect(cards[1].parallel).toBeNull();
  });

  it("prefers a lazy image's real source and resolves it absolute", () => {
    expect(cards[2].imageUrl).toBe(
      "https://en.onepiece-cardgame.com/images/cardlist/card/OP14-029_p1.png?250801",
    );
    expect(cards[0].imageUrl).toBe(
      "https://en.onepiece-cardgame.com/images/cardlist/card/OP14-001.png?250801",
    );
  });

  it("reads the series title off the page's own selector", () => {
    expect(parseSeriesTitle(PAGE)).toBe("ROYAL BLOOD [OP-14]");
  });

  it("implies the set code in the provider's own shape", () => {
    expect(impliedSetCode(cards)).toBe("OP-14");
  });

  it("reports fill rates so a label rename announces itself", () => {
    const report = discoverReport(cards).join("\n");
    expect(report).toContain("3 card blocks");
    expect(report).toContain("power        3 of 3");
    expect(report).toContain("parallels    1 of 3");
    /* Life appears once (the leader), cost twice — both facts visible. */
    expect(report).toContain("life         1 of 3");
    expect(report).toContain("cost         2 of 3");
  });
});

describe("the collected manifest", () => {
  const cards = parseBandaiCardlist(PAGE, PAGE_URL);
  const manifest = toImportManifest(cards, {
    setCode: "OP-14",
    setName: "ROYAL BLOOD",
  });

  it("is a valid import manifest, facts and all", () => {
    const parsed = importManifestSchema.safeParse(manifest);
    expect(parsed.success).toBe(true);
  });

  it("orders the base printing before its parallel", () => {
    const ace = manifest.cards.filter((card) => card.cardNumber === "OP14-029");
    expect(ace[0].parallel).toBeUndefined();
    expect(ace[1].parallel).toBe(1);
    /* The provider sync's words, so an imported chip reads like a
       synced one: "OP-14 · SR · Alternate Art". */
    expect(ace[1].printingLabel).toBe("Alternate Art");
  });

  it("names each picture after its slug, so parallels never collide", () => {
    expect(manifest.cards.map((card) => card.file)).toEqual([
      "OP14-001.png",
      "OP14-029.png",
      "OP14-029_p1.png",
    ]);
  });

  it("carries the gameplay facts in the sync's vocabulary", () => {
    const shanks = manifest.cards[0];
    expect(shanks.cardType).toBe("Leader");
    expect(shanks.colors).toEqual(["red"]);
    expect(shanks.life).toBe(4);
    expect(shanks.cost).toBeUndefined();
    expect(shanks.attribute).toBe("Slash");
  });
});

describe("the pieces on their own", () => {
  it("splits slugs", () => {
    expect(splitSlug("OP14-029_p1")).toEqual({
      cardNumber: "OP14-029",
      parallel: 1,
    });
    expect(splitSlug("OP14-029")).toEqual({ cardNumber: "OP14-029", parallel: null });
  });

  it("numbers alternate art labels past the first", () => {
    expect(parallelLabel(1)).toBe("Alternate Art");
    expect(parallelLabel(2)).toBe("Alternate Art 2");
  });

  it("keeps a jpg a jpg", () => {
    const card = parseBandaiCardlist(PAGE, PAGE_URL)[0];
    expect(imageFileName({ ...card, imageUrl: "https://x/y/OP14-001.jpg?1" })).toBe(
      "OP14-001.jpg",
    );
    expect(imageFileName(card)).toBe("OP14-001.png");
  });

  it("turns <br> into a line break and strips the rest", () => {
    expect(htmlToText("a<br>b <i>c</i>&amp;d")).toBe("a\nb c&d");
  });
});

describe("classifying a printing", () => {
  it("round-trips every choice through its columns", () => {
    for (const choice of PRINTING_CLASSIFICATIONS) {
      const columns = classificationColumns(choice);
      expect(classificationOf(columns)).toBe(choice);
    }
  });

  it("says what a human choice actually claims, in the provider's words", () => {
    /* The founder, comparing an import against a synced set: the words
       have to match what optcgapi lands, so search reads one way. The
       chip is label-or-set-code first, so the variant word must ride in
       variant_type and printing_label must stay null. */
    const manga = classificationColumns("manga");
    expect(manga.printing_label).toBeNull();
    expect(manga.variant_type).toBe("Manga");
    expect(manga.is_alternate_art).toBe(true);
    /* Classifying an art says nothing about reprints; null stays null. */
    expect(manga.is_reprint).toBeNull();

    expect(classificationColumns("alt-art").variant_type).toBe("Alternate Art");
    expect(classificationColumns("sp").variant_type).toBe("SP");

    const base = classificationColumns("base");
    expect(base.is_alternate_art).toBe(false);
    expect(base.printing_label).toBeNull();
    expect(base.variant_type).toBeNull();
  });

  it("lets a custom label override the word without changing the claim", () => {
    const special = classificationColumns("sp", "25th Anniversary");
    expect(special.variant_type).toBe("25th Anniversary");
    expect(special.printing_label).toBeNull();
    expect(special.is_alternate_art).toBe(true);
  });

  it("renders an imported chip exactly like a synced one", () => {
    /* The founder, two search results side by side: the synced set read
       "OP-16 · L · Alternate Art" and the import read "Alt art · L".
       "Make sure the naming structure when searching things is the
       same." This is that, pinned end to end. */
    const columns = classificationColumns("alt-art");
    const chip = printingLabel(
      {
        id: "p1",
        setCode: "OP-17",
        setName: "Set",
        printingLabel: columns.printing_label,
        variantType: columns.variant_type,
        rarity: "L",
        printingName: "Edward.Newgate",
        isPromo: columns.is_promo,
        imageUrl: null,
      },
      "Edward.Newgate",
    );

    expect(chip).toBe("OP-17 · L · Alternate Art");
  });

  it("returns to all-null when unclassified, the honest undo", () => {
    const cleared = classificationColumns("unclassified");
    expect(cleared).toEqual({
      printing_label: null,
      variant_type: null,
      is_alternate_art: null,
      is_parallel: null,
      is_promo: null,
      is_reprint: null,
    });
  });
});
