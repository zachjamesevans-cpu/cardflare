import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

/**
 * The cached feed, and the three ways a cache like this goes wrong.
 *
 * The founder: "it is quite disorienting opening the app and it slowly
 * loads all of the elements and they all kinda pop down ... so when you
 * open it, the most recent saved stuff from your last open is fresh
 * right there, then it loads in the background."
 *
 * Painting old data is easy. Painting old data safely is the work, and
 * each of these guards a way it could hurt somebody rather than merely
 * look wrong.
 */
const source = await readFile("mobile/src/feed-cache.ts", "utf8");

describe("the feed cache", () => {
  it("is keyed to the account", async () => {
    /* The failure this prevents is somebody else's feed on your phone.
       A read with a different id must miss, not fall back. */
    expect(source).toContain("keyFor");
    expect(source).toContain("${KEY_PREFIX}.${playerId}");
  });

  it("expires, because the Feed makes time-sensitive claims", () => {
    /* "A room is open right now" and "4d ago" are statements, not
       decoration. A day-old copy of them is false rather than stale. */
    expect(source).toMatch(/MAX_AGE_MS\s*=/);
    expect(source).toContain("Date.now() - cached.at > MAX_AGE_MS");
  });

  it("is cleared on sign-out, by the sign-out itself", async () => {
    /* Tokens stop the app talking to the server; the cache is what the
       next person to open the phone would SEE before it tries. */
    const api = await readFile("mobile/src/api.ts", "utf8");

    const signOut = api.slice(
      api.indexOf("export async function signOut"),
      api.indexOf("export async function signOut") + 700,
    );

    expect(signOut).toContain("clearFeedCache");
  });

  it("sweeps every account, not just the current one", () => {
    /* Whoever is signing out may not be whoever the last key names. */
    expect(source).toContain("getAllKeys");
    expect(source).toContain("multiRemove");
  });

  it("never throws its way into breaking the app", () => {
    /* A cache that cannot be read is a cache that is not used. Each of
       read, write and clear swallows and carries on — the screen must
       load exactly as it did before this file existed. */
    const catches = source.match(/} catch \{/g) ?? [];
    expect(catches.length).toBeGreaterThanOrEqual(4);
  });
});

describe("painting it", () => {
  it("never replaces content already on screen", async () => {
    /* A pull-to-refresh, or returning to the tab, must not swap what
       somebody is looking at for an older copy of it. */
    const home = await readFile("mobile/src/screens/home.tsx", "utf8");

    expect(home).toContain("feedRef.current.length > 0");
  });

  it("only writes a feed that actually loaded", async () => {
    const home = await readFile("mobile/src/screens/home.tsx", "utf8");

    const load = home.slice(home.indexOf("const load = useCallback"));
    const write = load.indexOf("writeFeedCache");
    const failure = load.indexOf(
      "} catch {",
      load.indexOf("const fresh = await getFeed"),
    );

    expect(write).toBeGreaterThan(0);
    /* The write sits before the catch, so a failed fetch can never
       overwrite a good cache with nothing. */
    expect(write).toBeLessThan(failure);
  });
});
