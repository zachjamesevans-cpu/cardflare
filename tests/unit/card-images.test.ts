import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  ALLOWED_IMAGE_HOSTS,
  cardImageAlt,
  cardImagesEnabled,
  isRenderableImageUrl,
} from "@/lib/cards/images";

const original = process.env.NEXT_PUBLIC_ENABLE_CARD_IMAGES;

beforeEach(() => {
  delete process.env.NEXT_PUBLIC_ENABLE_CARD_IMAGES;
});

afterEach(() => {
  if (original === undefined) delete process.env.NEXT_PUBLIC_ENABLE_CARD_IMAGES;
  else process.env.NEXT_PUBLIC_ENABLE_CARD_IMAGES = original;
});

describe("cardImagesEnabled", () => {
  /*
   * Off unless explicitly switched on. cardflare does not own card artwork, so
   * an install that has made no decision must not be requesting third-party
   * images.
   */
  it("is off when unset", () => {
    expect(cardImagesEnabled()).toBe(false);
  });

  it("is on only for the exact string true", () => {
    for (const value of ["false", "0", "no", "TRUE", "1", "", "yes"]) {
      process.env.NEXT_PUBLIC_ENABLE_CARD_IMAGES = value;
      expect(cardImagesEnabled()).toBe(false);
    }

    process.env.NEXT_PUBLIC_ENABLE_CARD_IMAGES = "true";
    expect(cardImagesEnabled()).toBe(true);
  });
});

describe("isRenderableImageUrl", () => {
  it("accepts an https URL on an allowed host", () => {
    expect(isRenderableImageUrl("https://optcgapi.com/images/OP01-024.png")).toBe(true);
  });

  it("rejects a missing URL", () => {
    expect(isRenderableImageUrl(null)).toBe(false);
    expect(isRenderableImageUrl(undefined)).toBe(false);
    expect(isRenderableImageUrl("")).toBe(false);
  });

  it("rejects http", () => {
    expect(isRenderableImageUrl("http://optcgapi.com/a.png")).toBe(false);
  });

  /*
   * An allow-list, not a pattern. A host that merely ends with the allowed
   * domain is a different host, and this is the check that keeps Next's image
   * optimiser from being pointed at arbitrary origins.
   */
  it("rejects a host that is not on the list", () => {
    for (const url of [
      "https://evil.example/a.png",
      "https://optcgapi.com.evil.example/a.png",
      "https://notoptcgapi.com/a.png",
    ]) {
      expect(isRenderableImageUrl(url)).toBe(false);
    }
  });

  it("returns false rather than throwing on a malformed value", () => {
    for (const url of ["not a url", "://", "javascript:alert(1)"]) {
      expect(() => isRenderableImageUrl(url)).not.toThrow();
      expect(isRenderableImageUrl(url)).toBe(false);
    }
  });

  it("matches the hosts declared to Next's image optimiser", () => {
    // Drifting from next.config.ts would mean a URL that passes here and then
    // fails to render, or vice versa. Read from the config itself, so a host
    // added for a new catalogue has to be added in both places.
    const config = readFileSync(join(process.cwd(), "next.config.ts"), "utf8");
    const declared = [...config.matchAll(/hostname:\s*"([^"]+)"/g)].map((m) => m[1]);
    expect([...ALLOWED_IMAGE_HOSTS]).toEqual(declared);
  });
});

describe("cardImageAlt", () => {
  it("identifies the card rather than being decorative", () => {
    expect(cardImageAlt("Monkey D. Luffy", "OP01-024")).toBe(
      "Monkey D. Luffy (OP01-024)",
    );
  });
});
