import { describe, expect, it } from "vitest";

import {
  generateJoinCode,
  isValidJoinCode,
  JOIN_CODE_ALPHABET,
  JOIN_CODE_LENGTH,
  normalizeJoinCode,
} from "@/lib/events/join-code";

describe("JOIN_CODE_ALPHABET", () => {
  /*
   * The alphabet is the whole design. Keeping the digit and dropping the
   * confusable letter is what makes normalisation possible; excluding both
   * would leave a mistyped character with nothing to correct to.
   */
  it("excludes the letters that collide with digits", () => {
    for (const letter of ["I", "L", "O", "U"]) {
      expect(JOIN_CODE_ALPHABET).not.toContain(letter);
    }
  });

  it("keeps every digit", () => {
    for (const digit of "0123456789") {
      expect(JOIN_CODE_ALPHABET).toContain(digit);
    }
  });

  it("has no duplicates", () => {
    expect(new Set(JOIN_CODE_ALPHABET).size).toBe(JOIN_CODE_ALPHABET.length);
  });
});

describe("generateJoinCode", () => {
  it("is the right length and drawn only from the alphabet", () => {
    for (let i = 0; i < 200; i += 1) {
      const code = generateJoinCode();

      expect(code).toHaveLength(JOIN_CODE_LENGTH);
      for (const character of code) {
        expect(JOIN_CODE_ALPHABET).toContain(character);
      }
    }
  });

  it("always produces a code the validator accepts", () => {
    for (let i = 0; i < 500; i += 1) {
      expect(isValidJoinCode(generateJoinCode())).toBe(true);
    }
  });

  /*
   * A predictable code is a way into an event room. This cannot prove
   * randomness, but a generator stuck on one value or one character fails it.
   */
  it("does not repeat itself over many draws", () => {
    const codes = new Set(Array.from({ length: 1000 }, generateJoinCode));

    expect(codes.size).toBeGreaterThan(990);
  });

  it("uses most of the alphabet across many draws", () => {
    const seen = new Set(Array.from({ length: 2000 }, generateJoinCode).join(""));

    expect(seen.size).toBe(JOIN_CODE_ALPHABET.length);
  });
});

describe("normalizeJoinCode", () => {
  it("uppercases", () => {
    expect(normalizeJoinCode("k3m9pz")).toBe("K3M9PZ");
  });

  it("strips the spaces and hyphens people add when copying", () => {
    expect(normalizeJoinCode("K3M 9PZ")).toBe("K3M9PZ");
    expect(normalizeJoinCode("K3M-9PZ")).toBe("K3M9PZ");
    expect(normalizeJoinCode(" K3M9PZ ")).toBe("K3M9PZ");
  });

  /*
   * The point of the alphabet: someone reading a printed 1 as an I, or a 0 as
   * an O, still gets into the room instead of being sent back to the counter.
   */
  it("corrects the confusable letters to their digits", () => {
    expect(normalizeJoinCode("I23456")).toBe("123456");
    expect(normalizeJoinCode("L23456")).toBe("123456");
    expect(normalizeJoinCode("O23456")).toBe("023456");
    expect(normalizeJoinCode("iloilo")).toBe("110110");
  });

  it("is idempotent", () => {
    const once = normalizeJoinCode("k3m-9pz");

    expect(normalizeJoinCode(once)).toBe(once);
  });
});

describe("isValidJoinCode", () => {
  it("accepts a well-formed code", () => {
    expect(isValidJoinCode("K3M9PZ")).toBe(true);
    expect(isValidJoinCode("000000")).toBe(true);
    expect(isValidJoinCode("ZZZZZZ")).toBe(true);
  });

  it("rejects the excluded letters", () => {
    for (const code of ["K3M9PI", "K3M9PL", "K3M9PO", "K3M9PU"]) {
      expect(isValidJoinCode(code)).toBe(false);
    }
  });

  it("rejects the wrong length or case", () => {
    for (const code of ["K3M9P", "K3M9PZ1", "k3m9pz", "", "K3M9P Z"]) {
      expect(isValidJoinCode(code)).toBe(false);
    }
  });

  // The regex must be anchored, or a code with junk around it would pass.
  it("rejects a valid code with anything around it", () => {
    for (const code of ["XK3M9PZ", "K3M9PZX", "/K3M9PZ", "K3M9PZ\n"]) {
      expect(isValidJoinCode(code)).toBe(false);
    }
  });
});
