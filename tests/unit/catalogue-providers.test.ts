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
import { lorcanaNumber, LorcastProvider } from "@/lib/cards/providers/lorcast/adapter";
import {
  RiftcodexProvider,
  riftboundNumber,
} from "@/lib/cards/providers/riftcodex/adapter";
import {
  baseNumbersByRecord,
  primaryType as mtgType,
  ScryfallProvider,
  subtypes,
  treatmentOf,
} from "@/lib/cards/providers/scryfall/adapter";
import { describeNetworkError } from "@/lib/cards/providers/http";
import { cleanSetCode, versionBases } from "@/lib/cards/providers/shared";
import {
  printedNumber,
  secretRareBases,
  TcgdexProvider,
} from "@/lib/cards/providers/tcgdex/adapter";
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
  it("names a provider for every game but One Piece", () => {
    expect(CATALOGUE_SOURCES.map((source) => source.game)).toEqual([
      "mtg",
      "pokemon",
      "flesh-and-blood",
      "riftbound",
      "lorcana",
    ]);
    for (const source of CATALOGUE_SOURCES) {
      const provider = providerForGame(source.game);
      expect(provider?.game).toBe(source.game);
      expect(provider?.providerKey).toBe(source.providerKey);
      expect(GAME_SLUGS).toContain(source.game);
    }
    /* One Piece has its own sync and its own by-hand importer. */
    expect(providerForGame("one-piece")).toBeNull();
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
    expect(cleanSetCode("1")).toBe("1");
    expect(cleanSetCode("")).toBeNull();
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

describe("Lorcast", () => {
  const provider = new LorcastProvider();

  const elsa = {
    id: "crd_9d3f2b8f0b1c4e2a9c7d5e6f7a8b9c0d",
    name: "Elsa",
    version: "Snow Queen",
    layout: "normal",
    released_at: "2023-08-18",
    image_uris: {
      digital: {
        small: "https://cards.lorcast.io/card/digital/small/crd_9d3f.avif?1700000000",
        normal: "https://cards.lorcast.io/card/digital/normal/crd_9d3f.avif?1700000000",
        large: "https://cards.lorcast.io/card/digital/large/crd_9d3f.avif?1700000000",
      },
    },
    cost: 8,
    inkwell: false,
    ink: "Amethyst",
    type: ["Character"],
    classifications: ["Storyborn", "Hero", "Queen", "Sorcerer"],
    text: "Deep Freeze: Exert up to 2 chosen characters.",
    strength: 4,
    willpower: 6,
    lore: 3,
    rarity: "Legendary",
    collector_number: "42",
    lang: "en",
    set: {
      id: "set_7ecb0e0c71af496a9e0110e78824e893",
      code: "1",
      name: "The First Chapter",
    },
    prices: { usd: "12.00" },
    legalities: { core: "legal" },
  };

  it("keys the card on set and number and names it with its version", () => {
    const result = provider.normalizeCard(elsa);
    if (!result.ok) throw new Error(result.failure.reason);
    expect(provider.game).toBe("lorcana");
    expect(result.card.canonicalCardNumber).toBe("1-042");
    expect(result.card.exactName).toBe("Elsa - Snow Queen");
    expect(result.card.cardType).toBe("character");
    expect(result.card.colors).toEqual(["amethyst"]);
    expect(result.card.cost).toBe(8);
    expect(result.card.power).toBe(4);
    expect(result.card.life).toBe(6);
    expect(result.card.traits).toEqual(["Storyborn", "Hero", "Queen", "Sorcerer"]);
    expect(result.card.printings[0].imageUrl).toContain("cards.lorcast.io");
    expect(result.card.printings[0].setName).toBe("The First Chapter");
    expect(result.card.printings[0].isAlternateArt).toBeNull();
  });

  it("marks an Enchanted printing as the alternate art, by Lorcast's own word", () => {
    const result = provider.normalizeCard({
      ...elsa,
      rarity: "Enchanted",
      collector_number: "207",
    });
    if (!result.ok) throw new Error(result.failure.reason);
    expect(result.card.canonicalCardNumber).toBe("1-207");
    expect(result.card.printings[0].isAlternateArt).toBe(true);
    expect(result.card.printings[0].variantType).toBe("Enchanted");
  });

  it("accepts a flat image_uris shape too, and drops prices", () => {
    const result = provider.normalizeCard({
      ...elsa,
      image_uris: { normal: "https://cards.lorcast.io/card/digital/normal/x.avif" },
    });
    if (!result.ok) throw new Error(result.failure.reason);
    expect(result.card.printings[0].imageUrl).toContain("/x.avif");
    expect((result.card.rawMetadata as Record<string, unknown>).prices).toBeUndefined();
  });

  it("refuses a card with no set or number", () => {
    expect(provider.normalizeCard({ ...elsa, set: undefined }).ok).toBe(false);
    expect(lorcanaNumber("1", "7")).toBe("1-007");
    expect(lorcanaNumber("Q1", "12a")).toBe("Q1-12A");
  });
});

describe("describeNetworkError", () => {
  it("puts the reason Node hides on `cause` back into the message", () => {
    const failed = new Error("fetch failed");
    (failed as { cause?: unknown }).cause = {
      code: "ENOTFOUND",
      message: "getaddrinfo ENOTFOUND api.tcgdex.net",
    };
    expect(describeNetworkError(failed, "https://api.tcgdex.net/v2/en/sets")).toBe(
      "Could not reach api.tcgdex.net (ENOTFOUND: getaddrinfo ENOTFOUND api.tcgdex.net)",
    );
  });

  it("names a timeout as a timeout", () => {
    const timeout = new Error("The operation was aborted due to timeout");
    timeout.name = "TimeoutError";
    expect(describeNetworkError(timeout, "https://api.scryfall.com/sets")).toBe(
      "Timed out reaching api.scryfall.com",
    );
  });

  it("still names the host when there is no cause at all", () => {
    expect(
      describeNetworkError(
        new Error("fetch failed"),
        "https://api.lorcast.com/v0/sets",
      ),
    ).toBe("Could not reach api.lorcast.com (fetch failed)");
    expect(describeNetworkError("nope", "https://api.lorcast.com/v0/sets")).toBe(
      "Could not reach api.lorcast.com",
    );
  });
});

describe("versions nest under one card", () => {
  it("keys a Magic showcase printing on its base card's number", async () => {
    const page = {
      data: [
        {
          id: "aaaaaaaa-0000-4000-8000-000000000001",
          oracle_id: "bolt-oracle",
          name: "Lightning Bolt",
          set: "mh3",
          set_name: "Modern Horizons 3",
          collector_number: "231",
          rarity: "uncommon",
          type_line: "Instant",
          image_uris: { normal: "https://cards.scryfall.io/normal/front/a/a/1.jpg" },
        },
        {
          id: "aaaaaaaa-0000-4000-8000-000000000002",
          oracle_id: "bolt-oracle",
          name: "Lightning Bolt",
          set: "mh3",
          set_name: "Modern Horizons 3",
          collector_number: "412",
          rarity: "uncommon",
          type_line: "Instant",
          frame_effects: ["showcase"],
          image_uris: { normal: "https://cards.scryfall.io/normal/front/a/a/2.jpg" },
        },
        {
          id: "aaaaaaaa-0000-4000-8000-000000000003",
          oracle_id: "other-oracle",
          name: "Ajani",
          set: "mh3",
          set_name: "Modern Horizons 3",
          collector_number: "1",
          rarity: "mythic",
          type_line: "Legendary Planeswalker — Ajani",
          image_uris: { normal: "https://cards.scryfall.io/normal/front/a/a/3.jpg" },
        },
      ],
      has_more: false,
    };
    const fetchImpl = (async () =>
      new Response(JSON.stringify(page), {
        status: 200,
        headers: { "content-type": "application/json" },
      })) as unknown as typeof fetch;
    const provider = new ScryfallProvider({ fetchImpl, sleep: async () => {} });

    const { cards, failures } = await provider.fetchCards({ setCode: "MH3" });
    expect(failures).toHaveLength(0);
    const numbers = cards.map((card) => card.canonicalCardNumber);
    /* The showcase printing is keyed on 231, so the sync merges it
       under the base card as a second printing. */
    expect(numbers).toEqual(["MH3-231", "MH3-231", "MH3-1"]);
    const showcase = cards[1].printings[0];
    expect(showcase.printingLabel).toBe("MH3 #412");
    expect(showcase.variantType).toBe("showcase");
    expect(showcase.isAlternateArt).toBe(true);
    expect(cards[0].printings[0].printingLabel).toBe("MH3 #231");
    expect(cards[0].printings[0].isAlternateArt).toBeNull();
  });

  it("prefers the plain printing as the base even when it is numbered later", () => {
    const bases = baseNumbersByRecord([
      {
        id: "x",
        oracle_id: "o",
        set: "blb",
        collector_number: "300",
        border_color: "borderless",
      },
      {
        id: "y",
        oracle_id: "o",
        set: "blb",
        collector_number: "301",
        border_color: "black",
      },
    ]);
    expect(bases.get("x")).toBe("301");
    expect(bases.get("y")).toBe("301");
    expect(treatmentOf({ border_color: "borderless" })).toBe("borderless");
    expect(treatmentOf({ promo_types: ["prerelease"] })).toBe("prerelease");
    expect(treatmentOf({ border_color: "black" })).toBeNull();
  });

  it("keys a Pokémon secret rare on the same-named card inside the official count", async () => {
    const set = {
      id: "sv3",
      name: "Obsidian Flames",
      cardCount: { official: 197, total: 230 },
      cards: [
        {
          id: "sv3-125",
          localId: "125",
          name: "Charizard ex",
          image: "https://assets.tcgdex.net/en/sv/sv3/125",
        },
        {
          id: "sv3-223",
          localId: "223",
          name: "Charizard ex",
          image: "https://assets.tcgdex.net/en/sv/sv3/223",
        },
        { id: "sv3-25", localId: "25", name: "Pikachu" },
        { id: "sv3-26", localId: "26", name: "Pikachu" },
        { id: "sv3-210", localId: "210", name: "Pikachu" },
      ],
    };
    const fetchImpl = (async () =>
      new Response(JSON.stringify(set), {
        status: 200,
        headers: { "content-type": "application/json" },
      })) as unknown as typeof fetch;
    const provider = new TcgdexProvider({ fetchImpl, sleep: async () => {} });

    const { cards } = await provider.fetchCards({ setCode: "sv3" });
    const byId = new Map(cards.map((card) => [card.providerExternalId, card]));

    expect(byId.get("sv3-223")?.canonicalCardNumber).toBe("SV3-125");
    expect(byId.get("sv3-223")?.printings[0].isAlternateArt).toBe(true);
    expect(byId.get("sv3-223")?.printings[0].printingLabel).toBe("SV3 #223");
    expect(byId.get("sv3-125")?.printings[0].isAlternateArt).toBeNull();
    /* Three Pikachus: the secret one cannot say which it is, so it stays its own card. */
    expect(byId.get("sv3-210")?.canonicalCardNumber).toBe("SV3-210");
  });

  it("nests nothing when the set does not say its official count", () => {
    expect(
      secretRareBases(
        [
          { id: "a", localId: "1", name: "X" },
          { id: "b", localId: "9", name: "X" },
        ],
        undefined,
      ).size,
    ).toBe(0);
  });
});

describe("Lorcana and Riftbound versions", () => {
  it("keys an Enchanted Lorcana card on the card it is a version of", async () => {
    const set = [
      {
        id: "crd_a",
        name: "Elsa",
        version: "Snow Queen",
        rarity: "Legendary",
        collector_number: "42",
        set: { code: "1", name: "The First Chapter" },
        image_uris: { digital: { normal: "https://cards.lorcast.io/a.avif" } },
      },
      {
        id: "crd_b",
        name: "Elsa",
        version: "Snow Queen",
        rarity: "Enchanted",
        collector_number: "207",
        set: { code: "1", name: "The First Chapter" },
        image_uris: { digital: { normal: "https://cards.lorcast.io/b.avif" } },
      },
      {
        id: "crd_c",
        name: "Elsa",
        version: "Spirit of Winter",
        rarity: "Legendary",
        collector_number: "43",
        set: { code: "1", name: "The First Chapter" },
      },
    ];
    const fetchImpl = (async () =>
      new Response(JSON.stringify(set), {
        status: 200,
        headers: { "content-type": "application/json" },
      })) as unknown as typeof fetch;
    const provider = new LorcastProvider({ fetchImpl, sleep: async () => {} });

    const { cards, failures } = await provider.fetchCards({ setCode: "1" });
    expect(failures).toHaveLength(0);
    expect(cards.map((card) => card.canonicalCardNumber)).toEqual([
      "1-042",
      "1-042",
      "1-043",
    ]);
    expect(cards[1].printings[0].printingLabel).toBe("1 #207");
    expect(cards[1].printings[0].isAlternateArt).toBe(true);
    expect(cards[0].printings[0].printingLabel).toBe("1 #42");
  });

  it("keys a Riftbound alternate art on the card it is a version of", async () => {
    const all = [
      {
        id: "r1",
        name: "Jinx, Loose Cannon",
        setId: "OGN",
        setLabel: "Origins",
        collectorNumber: 142,
        type: "Legend",
        domains: ["Chaos"],
        alternateArt: false,
        imageUrl: "https://cmsassets.rgpub.io/1.png",
      },
      {
        id: "r2",
        name: "Jinx, Loose Cannon",
        setId: "OGN",
        setLabel: "Origins",
        collectorNumber: 300,
        type: "Legend",
        domains: ["Chaos"],
        alternateArt: true,
        imageUrl: "https://cmsassets.rgpub.io/2.png",
      },
      {
        id: "r3",
        name: "Jinx, Loose Cannon",
        setId: "UNL",
        setLabel: "Unleashed",
        collectorNumber: 9,
        type: "Legend",
        domains: ["Chaos"],
        alternateArt: true,
      },
    ];
    const fetchImpl = (async () =>
      new Response(JSON.stringify(all), {
        status: 200,
        headers: { "content-type": "application/json" },
      })) as unknown as typeof fetch;
    const provider = new RiftcodexProvider({ fetchImpl, sleep: async () => {} });

    const { cards } = await provider.fetchCards({});
    const byId = new Map(cards.map((card) => [card.providerExternalId, card]));
    expect(byId.get("r2")?.canonicalCardNumber).toBe("OGN-142");
    expect(byId.get("r2")?.printings[0].printingLabel).toBe("OGN #300");
    /* Another set's alternate has no base in its own set: its own card. */
    expect(byId.get("r3")?.canonicalCardNumber).toBe("UNL-009");
  });

  it("refuses to guess between two same-named base cards", () => {
    const bases = versionBases(
      [
        { id: "a", set: "s", name: "Pikachu", v: false },
        { id: "b", set: "s", name: "Pikachu", v: false },
        { id: "c", set: "s", name: "Pikachu", v: true },
      ],
      {
        id: (r) => r.id,
        set: (r) => r.set,
        name: (r) => r.name,
        isVersion: (r) => r.v,
      },
    );
    expect(bases.size).toBe(0);
  });
});
