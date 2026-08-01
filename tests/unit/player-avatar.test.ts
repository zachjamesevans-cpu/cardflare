import { describe, expect, it } from "vitest";

import { AVATAR_HUE_COUNT, avatarHue, initials } from "@/lib/players/avatar";

describe("avatarHue", () => {
  /*
   * A player's colour must not change under them between renders, processes or
   * deploys — that is the difference between an identity and a flicker.
   */
  it("is stable for the same seed", () => {
    const seed = "11111111-1111-1111-1111-111111111111";

    expect(avatarHue(seed)).toBe(avatarHue(seed));
  });

  it("only ever returns a hue that has a token", () => {
    for (let i = 0; i < 500; i += 1) {
      const hue = avatarHue(`session-${i}`);

      expect(hue).toBeGreaterThanOrEqual(1);
      expect(hue).toBeLessThanOrEqual(AVATAR_HUE_COUNT);
      expect(Number.isInteger(hue)).toBe(true);
    }
  });

  it("uses every hue across many players", () => {
    const seen = new Set(
      Array.from({ length: 500 }, (_, i) => avatarHue(`session-${i}`)),
    );

    expect(seen.size).toBe(AVATAR_HUE_COUNT);
  });

  it("spreads players reasonably evenly", () => {
    const counts = new Array(AVATAR_HUE_COUNT).fill(0);
    const total = 6000;

    for (let i = 0; i < total; i += 1) counts[avatarHue(`session-${i}`) - 1] += 1;

    // A uniform split is 1/6. Anything outside half to double that is a hash
    // that clusters, which would put a whole room on one colour.
    for (const count of counts) {
      expect(count).toBeGreaterThan(total / AVATAR_HUE_COUNT / 2);
      expect(count).toBeLessThan((total / AVATAR_HUE_COUNT) * 2);
    }
  });

  it("gives different seeds different hues at least some of the time", () => {
    const a = avatarHue("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
    const distinct = new Set([a]);

    for (let i = 0; i < 20; i += 1) distinct.add(avatarHue(`other-${i}`));

    expect(distinct.size).toBeGreaterThan(1);
  });

  it("does not throw on an empty seed", () => {
    expect(() => avatarHue("")).not.toThrow();
  });
});

describe("initials", () => {
  it("takes one letter from a single-word name", () => {
    expect(initials("Zach")).toBe("Z");
  });

  it("takes the first and last word of a longer name", () => {
    expect(initials("Zach Evans")).toBe("ZE");
    expect(initials("Monkey D Luffy")).toBe("ML");
  });

  it("uppercases", () => {
    expect(initials("zach evans")).toBe("ZE");
  });

  it("ignores extra whitespace", () => {
    expect(initials("  Zach   Evans  ")).toBe("ZE");
  });

  /*
   * Display names accept emoji and non-Latin scripts, so slicing by code unit
   * would render half a surrogate pair — a broken glyph next to someone's name.
   */
  it("keeps a multi-code-unit character whole", () => {
    const result = initials("\u{1F525} Zach");

    expect(result.startsWith("\u{1F525}")).toBe(true);
    expect(result).not.toContain("�");
  });

  it("handles non-Latin scripts", () => {
    expect(initials("ゾロ")).toBe("ゾ");
    expect(initials("Зак Эванс")).toBe("ЗЭ");
  });

  it("falls back rather than rendering nothing", () => {
    expect(initials("")).toBe("?");
    expect(initials("   ")).toBe("?");
  });
});
