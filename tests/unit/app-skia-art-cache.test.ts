import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/*
 * The founder, switching Feed tabs: "it takes a second or two for some of
 * my cards to load. is this not being cached?" The slow ones were the
 * found cards (drawn grey by Skia) and holos: Skia's `useImage` fetched
 * the URL on every mount with no cache, while the colour tiles beside
 * them came from expo-image's memory and disk cache.
 */
const foil = readFileSync(
  resolve(import.meta.dirname, "../../mobile/src/foil.tsx"),
  "utf8",
).replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");

describe("Skia card art is cached", () => {
  it("never loads art through Skia's uncached useImage", () => {
    expect(foil).not.toMatch(/\buseImage\b/);
    expect(foil.match(/useCachedImage\(imageUrl\)/g)?.length).toBe(2);
  });

  it("keeps decoded art in memory and reads bytes from expo-image's disk cache", () => {
    expect(foil).toContain("const decoded = new Map<string, SkImage>()");
    expect(foil).toContain("ExpoImage.getCachePathAsync(url)");
    expect(foil).toContain('ExpoImage.prefetch(url, "disk")');
    /* One load per URL however many tiles ask. */
    expect(foil).toContain("loading.set(url, load)");
  });
});
