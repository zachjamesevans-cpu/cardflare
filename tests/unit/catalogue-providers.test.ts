import { describe, expect, it } from "vitest";

import { ALLOWED_IMAGE_HOSTS } from "@/lib/cards/images";
import {
  FabCubeProvider,
  primaryType as fabType,
} from "@/lib/cards/providers/fabcube/adapter";
import {
  CATALOGUE_IMAGE_HOSTS,
  CATALOGUE_SOURCES,
  catalogueSource,
  providerForGame,
} from "@/lib/cards/providers/registry";
import {
  RiftcodexProvider,
  riftboundNumber,
} from "@/lib/cards/providers/riftcodex/adapter";
import {
  primaryType as mtgType,
  ScryfallProvider,
  subtypes,
} from "@/lib/cards/providers/scryfall/adapter";
import { cleanSetCode } from "@/lib/cards/providers/shared";
import { printedNumber, TcgdexProvider } from "@/lib/cards/providers/tcgdex/adapter";
import { GAME_SLUGS } from "@/lib/players/games-catalog";

/**
 * The four public catalogues, normalised against fixtures shaped like
 * the real answers (read from each source's documentation and, for
 * Riftcodex, from the vendored copy in the open-source Discord bot).
 * The network is not touched: what is tested is that a record of that
 * shape becomes a cardflare card with the right number, game and art,
 * and that a record missing its identity is refused rather than
 * guessed at.
 */

describe("the registry", () => {
  it("names a provider for exactly the four games the founder asked for", () => {
    expect(CATALOGUE_SOURCES.map((source) => source.game)).toEqual([
      "mtg",
      "pokemon",
      "flesh-and-blood",
      "riftbound",
    ]);
    for (const source of CATALOGUE_SOURCES) {
      const provider = providerForGame(source.game);
      expect(provider?.game).toBe(source.game);
      expect(provider?.providerKey).toBe(source.providerKey);
      expect(GAME_SLUGS).toContain(source.game);
    }
    /* One Piece has its own sync; Lorcana has no catalogue yet. */
    expect(providerForGame("one-piece")).toBeNull();
    expect(providerForGame("lorcana")).toBeNull();
    expect(catalogueSource("yugioh")).toBeNull();
  });

  it("has every picture host on the render allow-list", () => {
    for (const host of CATALOGUE_IMAGE_HOSTS) {
      expect(ALLOWED_IMAGE_HOSTS).toContain(host);
    }
  });

  it("shapes a set code before it can reach a request path", () => {
    expect(cleanSetCode(" mh3 ")).toBe("MH3");
    expect(cleanSetCode("swsh12")).toBe("SWSH12");
    expect(cleanSetCode("../etc")).toBeNull();
    expect(cleanSetCode("a")).toBeNull();
    expect(cleanSetCode(undefined)).toBeNull();
  });
});

describe("Scryfall", () => {
  const provider = new ScryfallProvider();

  const bolt = {
    id: "77c6fa74-5543-42ac-9ead-0e890b188e99",
    name: "Lightning Bolt",
    lang: "en",
    released_at: "2024-06-14",
    set: "mh3",
    set_name: "Modern Horizons 3",
    collector_number: "231",
    rarity: "uncommon",
    type_line: "Instant",
    oracle_text: "Lightning Bolt deals 3 damage to any target.",
    mana_cost: "{R}",
    cmc: 1,
    colors: ["R"],
    image_uris: {
      small: "https://cards.scryfall.io/small/front/7/7/77c6fa74.jpg",
      normal: "https://cards.scryfall.io/normal/front/7/7/77c6fa74.jpg",
    },
    prices: { usd: "1.20" },
    legalities: { modern: "legal" },
    reprint: true,
    promo: false,
  };

  it("keys the card on set and collector number, under Magic", () => {
    const result = provider.normalizeCard(bolt);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(provider.game).toBe("mtg");
    expect(result.card.canonicalCardNumber).toBe("MH3-231");
    expect(result.card.exactName).toBe("Lightning Bolt");
    expect(result.card.cardType).toBe("instant");
    expect(result.card.colors).toEqual(["red"]);
    expect(result.card.cost).toBe(1);
    expect(result.card.printings).toHaveLength(1);
    expect(result.card.printings[0].providerExternalId).toBe(`scryfall:${bolt.id}`);
    expect(result.card.printings[0].setCode).toBe("MH3");
    expect(result.card.printings[0].imageUrl).toBe(bolt.image_uris.normal);
    expect(result.card.printings[0].isReprint).toBe(true);
  });

  it("drops prices and legalities before storing the record", () => {
    const result = provider.normalizeCard(bolt);
    if (!result.ok) throw new Error("expected ok");
    const stored = result.card.rawMetadata as Record<string, unknown>;
    expect(stored.prices).toBeUndefined();
    expect(stored.legalities).toBeUndefined();
    expect(stored.oracle_text).toBe(bolt.oracle_text);
  });

  it("reads a double-faced card from its front face", () => {
    const dfc = {
      ...bolt,
      id: "1c7ad3a0-3a1c-4a70-9a6a-0e7a9f9b1a11",
      name: "Delver of Secrets // Insectile Aberration",
      collector_number: "47",
      type_line: "Creature — Human Wizard // Creature — Human Insect",
      oracle_text: undefined,
      image_uris: undefined,
      colors: undefined,
      card_faces: [
        {
          name: "Delver of Secrets",
          type_line: "Creature — Human Wizard",
          oracle_text: "At the beginning of your upkeep, look at the top card.",
          colors: ["U"],
          power: "1",
          image_uris: {
            normal: "https://cards.scryfall.io/normal/front/1/c/1c7ad3a0.jpg",
          },
        },
        {
          name: "Insectile Aberration",
          type_line: "Creature — Human Insect",
          oracle_text: "Flying",
          colors: ["U"],
          power: "3",
        },
      ],
    };
    const result = provider.normalizeCard(dfc);
    if (!result.ok) throw new Error(result.failure.reason);
    expect(result.card.cardType).toBe("creature");
    expect(result.card.traits).toEqual(["Human", "Wizard"]);
    expect(result.card.colors).toEqual(["blue"]);
    expect(result.card.power).toBe(1);
    expect(result.card.effectText).toContain("//");
    expect(result.card.printings[0].imageUrl).toContain("1c7ad3a0");
  });

  it("refuses a record with no set or number rather than inventing one", () => {
    const result = provider.normalizeCard({ ...bolt, set: undefined });
    expect(result.ok).toBe(false);
    expect(provider.normalizeCard("nope").ok).toBe(false);
  });

  it("reads type lines the way a filter word is typed", () => {
    expect(mtgType("Legendary Creature — Elf Warrior")).toBe("creature");
    expect(mtgType("Artifact Creature — Golem")).toBe("creature");
    expect(mtgType("Sorcery")).toBe("sorcery");
    expect(subtypes("Legendary Creature — Elf Warrior")).toEqual(["Elf", "Warrior"]);
    expect(subtypes("Instant")).toEqual([]);
  });

  it("will not pull the whole game", async () => {
    const { cards, failures } = await provider.fetchCards({});
    expect(cards).toHaveLength(0);
    expect(failures[0].reason).toContain("one set at a time");
  });
});

describe("TCGdex", () => {
  const provider = new TcgdexProvider();

  it("keys the card on set and printed number, under Pokémon", () => {
    const result = provider.normalizeCard({
      id: "sv1-1",
      localId: "1",
      name: "Pineco",
      image: "https://assets.tcgdex.net/en/sv/sv1/1",
      set: { id: "sv1", name: "Scarlet & Violet" },
    });
    if (!result.ok) throw new Error(result.failure.reason);
    expect(provider.game).toBe("pokemon");
    expect(result.card.canonicalCardNumber).toBe("SV1-001");
    expect(result.card.printings[0].imageUrl).toBe(
      "https://assets.tcgdex.net/en/sv/sv1/1/high.png",
    );
    expect(result.card.printings[0].setName).toBe("Scarlet & Violet");
    expect(result.card.printings[0].providerExternalId).toBe("tcgdex:sv1-1");
  });

  it("pads only purely numeric ids", () => {
    expect(printedNumber("1")).toBe("001");
    expect(printedNumber("198")).toBe("198");
    expect(printedNumber("tg01")).toBe("TG01");
  });

  it("carries no picture when the listing has none", () => {
    const result = provider.normalizeCard({
      id: "sv1-2",
      localId: "2",
      name: "Heracross",
      set: { id: "sv1", name: "Scarlet & Violet" },
    });
    if (!result.ok) throw new Error(result.failure.reason);
    expect(result.card.printings[0].imageUrl).toBeNull();
  });

  it("will not pull the whole game", async () => {
    const { failures } = await provider.fetchCards({});
    expect(failures[0].reason).toContain("one set at a time");
  });
});

describe("the-fab-cube", () => {
  const provider = new FabCubeProvider();

  const reunion = {
    unique_id: "FM9T9Dg8bj9h9MW7k9HCQ",
    name: "10,000 Year Reunion",
    color: "Red",
    pitch: "1",
    cost: "8",
    power: "",
    defense: "3",
    health: "",
    types: ["Illusionist", "Action", "Aura"],
    type_text: "Illusionist Action - Aura",
    functional_text_plain: "You may remove three +1 counters.\nWard 10",
    printings: [
      {
        unique_id: "q9B6nmKrdz8HnQnJMpQdc",
        id: "MST131",
        set_id: "MST",
        edition: "N",
        foiling: "S",
        rarity: "M",
        art_variations: [],
        image_url:
          "https://legendstory-production-s3-public.s3.amazonaws.com/media/cards/large/MST131.webp",
      },
      {
        unique_id: "tfbzDMBLmg697ptPJBDzP",
        id: "MST131",
        set_id: "MST",
        edition: "N",
        foiling: "R",
        rarity: "M",
        art_variations: [],
        image_url:
          "https://legendstory-production-s3-public.s3.amazonaws.com/media/cards/large/MST131.webp",
      },
    ],
    __set_names: { MST: "Part the Mistveil" },
  };

  it("keys the card on the printing id, with every foiling as a printing", () => {
    const result = provider.normalizeCard(reunion);
    if (!result.ok) throw new Error(result.failure.reason);
    expect(provider.game).toBe("flesh-and-blood");
    expect(result.card.canonicalCardNumber).toBe("MST131");
    expect(result.card.cardType).toBe("action");
    expect(result.card.colors).toEqual(["red"]);
    expect(result.card.cost).toBe(8);
    expect(result.card.traits).toEqual(["Illusionist", "Action", "Aura"]);
    expect(result.card.printings).toHaveLength(2);
    expect(result.card.printings.map((p) => p.variantType)).toEqual([
      "Standard",
      "Rainbow Foil",
    ]);
    expect(result.card.printings[0].setName).toBe("Part the Mistveil");
    expect(result.card.printings[0].imageUrl).toContain("MST131.webp");
  });

  it("reads the primary type off the type text", () => {
    expect(fabType("Ninja Action - Attack")).toBe("action");
    expect(fabType("Hero - Young")).toBe("hero");
    expect(fabType("Equipment - Head")).toBe("equipment");
    expect(fabType(null)).toBeNull();
  });

  it("does not store the printings array twice", () => {
    const result = provider.normalizeCard(reunion);
    if (!result.ok) throw new Error("expected ok");
    const stored = result.card.rawMetadata as Record<string, unknown>;
    expect(stored.printings).toBeUndefined();
    expect(stored.__set_names).toBeUndefined();
  });
});

describe("Riftcodex", () => {
  const provider = new RiftcodexProvider();

  const abandon = {
    id: "69bc5be9d308c64675ca8957",
    name: "Abandon",
    baseName: "Abandon",
    riftboundId: "unl-131-219",
    collectorNumber: 131,
    type: "Spell",
    supertype: null,
    rarity: "Uncommon",
    domains: ["Chaos"],
    energy: 2,
    might: null,
    power: null,
    text: "[Reaction] Counter a spell.",
    flavour: null,
    setId: "UNL",
    setLabel: "Unleashed",
    imageUrl:
      "https://cmsassets.rgpub.io/sanity/images/dsfx7636/game_data_live/89929cfa.png?accountingTag=RB",
    artist: "Kudos Productions",
    tags: [],
    signature: false,
    alternateArt: false,
    tcgplayerId: "684202",
  };

  it("keys the card on set and three-digit number, under Riftbound", () => {
    const result = provider.normalizeCard(abandon);
    if (!result.ok) throw new Error(result.failure.reason);
    expect(provider.game).toBe("riftbound");
    expect(result.card.canonicalCardNumber).toBe("UNL-131");
    expect(result.card.cardType).toBe("spell");
    expect(result.card.colors).toEqual(["chaos"]);
    expect(result.card.cost).toBe(2);
    expect(result.card.printings[0].setName).toBe("Unleashed");
    expect(result.card.printings[0].imageUrl).toBe(abandon.imageUrl);
    expect(result.card.printings[0].isAlternateArt).toBeNull();
  });

  it("states an alternate art only when the record does", () => {
    const result = provider.normalizeCard({
      ...abandon,
      alternateArt: true,
      supertype: "Signature",
    });
    if (!result.ok) throw new Error(result.failure.reason);
    expect(result.card.printings[0].isAlternateArt).toBe(true);
    expect(result.card.printings[0].variantType).toBe("Signature");
  });

  it("pads the number the way the card prints it", () => {
    expect(riftboundNumber("ogn", 56)).toBe("OGN-056");
    expect(riftboundNumber("UNL", 131)).toBe("UNL-131");
  });
});
