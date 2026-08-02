import { describe, expect, it } from "vitest";

import {
  classifyCode,
  generateJoinCode,
  generateStoreCode,
  isValidJoinCode,
  JOIN_CODE_ALPHABET,
  JOIN_CODE_LENGTH,
  normalizeJoinCode,
  STORE_CODE_LENGTH,
  STORE_CODE_PATTERN,
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

  /* Seven characters is a store's counter code, not a malformed event code. */
  it("accepts a store code", () => {
    expect(isValidJoinCode("K3M9PZQ")).toBe(true);
    expect(isValidJoinCode("0000000")).toBe(true);
  });

  it("rejects the wrong length or case", () => {
    for (const code of ["K3M9P", "K3M9PZ12", "k3m9pz", "", "K3M9P Z"]) {
      expect(isValidJoinCode(code)).toBe(false);
    }
  });

  // The regex must be anchored, or a code with junk around it would pass.
  it("rejects a valid code with anything around it", () => {
    for (const code of ["XK3M9PZQ", "K3M9PZQX", "/K3M9PZ", "K3M9PZ\n"]) {
      expect(isValidJoinCode(code)).toBe(false);
    }
  });
});

/**
 * The two code spaces.
 *
 * Length is the only thing separating a store's permanent counter code from a
 * single event's code, and everything routes on that distinction — so it is
 * worth pinning down rather than leaving to the regexes.
 */
describe("classifyCode", () => {
  it("calls six characters an event", () => {
    expect(classifyCode("K3M9PZ")).toBe("event");
  });

  it("calls seven characters a store", () => {
    expect(classifyCode("K3M9PZQ")).toBe("store");
  });

  it("calls anything else nothing at all", () => {
    for (const code of ["K3M9P", "K3M9PZQ8", "", "k3m9pz", "K3M9PU"]) {
      expect(classifyCode(code)).toBeNull();
    }
  });

  it("never classifies one length as the other", () => {
    for (let i = 0; i < 200; i += 1) {
      expect(classifyCode(generateJoinCode())).toBe("event");
      expect(classifyCode(generateStoreCode())).toBe("store");
    }
  });
});

describe("generateStoreCode", () => {
  /*
   * Seven characters, so a store code can never collide with an event code.
   * Two separate unique indexes would not prevent that, and the failure would
   * be silent: a laminated counter code resolving to a stranger's event.
   */
  it("is one character longer than an event code", () => {
    expect(generateStoreCode()).toHaveLength(JOIN_CODE_LENGTH + 1);
    expect(generateStoreCode()).toHaveLength(STORE_CODE_LENGTH);
  });

  it("uses only the unambiguous alphabet", () => {
    for (let i = 0; i < 200; i += 1) {
      expect(generateStoreCode()).toMatch(STORE_CODE_PATTERN);
    }
  });

  it("survives normalisation unchanged, so a typed code matches a stored one", () => {
    for (let i = 0; i < 200; i += 1) {
      const code = generateStoreCode();

      expect(normalizeJoinCode(code)).toBe(code);
    }
  });
});
