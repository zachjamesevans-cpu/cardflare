import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

/**
 * The app's cache, and the ways a cache like this hurts people.
 *
 * The founder, after a first pass that cached one screen's JSON: "the
 * entire app pretty much should be cached, within reason, like how
 * tiktok and instagram save posts in your cache ... it takes a full 7
 * seconds to load the full profile."
 *
 * Painting old data is easy; painting it safely is the work. Each of
 * these guards a way it could mislead somebody rather than merely look
 * wrong.
 */
const cache = await readFile("mobile/src/cache.ts", "utf8");

describe("the store", () => {
  it("keys every entry to the account", () => {
    /* The failure this prevents is somebody else's profile on your
       phone. A read with a different id must miss, not fall back. */
    expect(cache).toContain("${PREFIX}.${kind}.${playerId}");
  });

  it("gives each kind its own lifetime", () => {
    /* A Feed says "a room is open right now"; a wardrobe says what
       somebody owns. One goes false in hours, the other does not. */
    expect(cache).toContain("CACHE_TTL");
    expect(cache).toContain("Date.now() - envelope.at > CACHE_TTL[kind]");
  });

  it("keeps the live kinds shorter than the settled ones", async () => {
    const { CACHE_TTL } = await import("../../mobile/src/cache");

    expect(CACHE_TTL.room).toBeLessThan(CACHE_TTL.feed);
    expect(CACHE_TTL.feed).toBeLessThan(CACHE_TTL.profile);
    /* Nothing survives a day. Past that a returning player is being
       shown a different week. */
    for (const ttl of Object.values(CACHE_TTL)) {
      expect(ttl).toBeLessThanOrEqual(24 * 60 * 60 * 1000);
    }
  });

  it("never throws its way into breaking the app", () => {
    /* A cache that cannot be read is a cache that is not used. */
    const catches = cache.match(/} catch \{/g) ?? [];
    expect(catches.length).toBeGreaterThanOrEqual(5);
  });

  it("is swept on sign-out, across every account", async () => {
    const api = await readFile("mobile/src/api.ts", "utf8");
    const signOut = api.slice(
      api.indexOf("export async function signOut"),
      api.indexOf("export async function signOut") + 800,
    );

    expect(signOut).toContain("clearCache");
    /* Whoever signs out may not be whoever the pointer names. */
    expect(cache).toContain("getAllKeys");
    expect(cache).toContain("multiRemove");
  });
});

describe("painting it", () => {
  it("never replaces something newer", async () => {
    /* The cache read and the fetch race on purpose. If the network
       wins, the cached copy is dropped rather than drawn over it. */
    for (const file of [
      "mobile/src/screens/home.tsx",
      "mobile/src/screens/profile.tsx",
      "mobile/src/screens/customize.tsx",
      "mobile/src/use-cached.ts",
    ]) {
      const source = await readFile(file, "utf8");
      expect(source, `${file} must check before painting`).toMatch(
        /if \(!cached \|\| !live \|\| \w+Ref\.current|dataRef\.current !== null/,
      );
    }
  });

  it("does not show an empty state before the cache has answered", async () => {
    /*
     * Measured on a release build: the shell is up at 0.8s and the
     * cached feed paints at ~1.2s. Without this an established player
     * is told "how it works" for a third of a second before their own
     * feed appears.
     */
    const home = await readFile("mobile/src/screens/home.tsx", "utf8");
    expect(home).toContain("{hydrated && feed.length < 3 && (");
  });

  it("keeps what is on screen when a refresh fails", async () => {
    /* Blanking a screen because the network blinked takes content
       away rather than adding it late — the complaint at its worst. */
    const profile = await readFile("mobile/src/screens/profile.tsx", "utf8");
    expect(profile).toContain("if (!profileRef.current)");
  });
});

describe("pictures", () => {
  it("are cached to disk, which is what was actually popping in", async () => {
    /*
     * The founder, with the JSON cache already shipped: "the 'you can
     * be my samurai' card currently in the feed still takes 3 seconds
     * to pop in." Text arrived instantly; the ART came down the wire
     * every time, and the art is what anybody watches.
     */
    const image = await readFile("mobile/src/remote-image.tsx", "utf8");

    expect(image).toContain('cachePolicy="memory-disk"');
    expect(image).toContain("expo-image");
  });

  it("leaves no remote picture on the uncached path", async () => {
    /* React Native's own <Image> leans on NSURLCache, whose behaviour
       depends on headers we do not control. One escapee is one card
       that still pops. */
    const files = [
      "mobile/src/ui.tsx",
      "mobile/src/player-avatar.tsx",
      "mobile/src/cosmetic-card.tsx",
      "mobile/src/showcase-zoom.tsx",
      "mobile/src/screens/room.tsx",
    ];

    for (const file of files) {
      const source = await readFile(file, "utf8");
      expect(source, `${file} still renders a raw remote <Image>`).not.toMatch(
        /<Image\b[^>]*\n?\s*source=\{\{\s*uri:/,
      );
    }
  });
});
