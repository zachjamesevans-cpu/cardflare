import { describe, expect, it } from "vitest";

import { ALLOWED_IMAGE_HOSTS } from "@/lib/cards/images";
import { describeNetworkError } from "@/lib/cards/providers/http";
import {
  CATALOGUE_IMAGE_HOSTS,
  CATALOGUE_SOURCES,
  catalogueSource,
  providerForGame,
} from "@/lib/cards/providers/registry";
import { cleanSetCode, versionBases } from "@/lib/cards/providers/shared";
import { GAME_SLUGS } from "@/lib/players/games-catalog";

/**
 * The catalogue registry and the helpers every provider shares. The
 * Scrydex adapter's own mapping is in scrydex-adapter.test.ts.
 */

describe("the registry", () => {
  it("names Scrydex for every game it carries, and nothing for Flesh and Blood", () => {
    /* One source for every game since 2026-11-25. */
    expect(CATALOGUE_SOURCES.map((source) => source.game)).toEqual([
      "one-piece",
      "pokemon",
      "mtg",
      "lorcana",
      "riftbound",
      "gundam",
    ]);
    for (const source of CATALOGUE_SOURCES) expect(source.providerKey).toBe("scrydex");
    for (const source of CATALOGUE_SOURCES) {
      const provider = providerForGame(source.game);
      expect(provider?.game).toBe(source.game);
      expect(provider?.providerKey).toBe(source.providerKey);
      expect(GAME_SLUGS).toContain(source.game);
    }
    /* Scrydex does not carry Flesh and Blood. */
    expect(providerForGame("flesh-and-blood")).toBeNull();
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

describe("describeNetworkError", () => {
  it("puts the reason Node hides on `cause` back into the message", () => {
    const failed = new Error("fetch failed");
    (failed as { cause?: unknown }).cause = {
      code: "ENOTFOUND",
      message: "getaddrinfo ENOTFOUND api.scrydex.com",
    };
    expect(
      describeNetworkError(failed, "https://api.scrydex.com/pokemon/v1/expansions"),
    ).toBe(
      "Could not reach api.scrydex.com (ENOTFOUND: getaddrinfo ENOTFOUND api.scrydex.com)",
    );
  });

  it("names a timeout as a timeout", () => {
    const timeout = new Error("The operation was aborted due to timeout");
    timeout.name = "TimeoutError";
    expect(
      describeNetworkError(
        timeout,
        "https://api.scrydex.com/magicthegathering/v1/expansions",
      ),
    ).toBe("Timed out reaching api.scrydex.com");
  });

  it("still names the host when there is no cause at all", () => {
    expect(
      describeNetworkError(
        new Error("fetch failed"),
        "https://api.scrydex.com/lorcana/v1/expansions",
      ),
    ).toBe("Could not reach api.scrydex.com (fetch failed)");
    expect(
      describeNetworkError("nope", "https://api.scrydex.com/lorcana/v1/expansions"),
    ).toBe("Could not reach api.scrydex.com");
  });
});

describe("versionBases", () => {
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
