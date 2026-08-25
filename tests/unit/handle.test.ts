import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  formatHandle as appFormatHandle,
  handleFrom as appHandleFrom,
  handleSeedFrom as appHandleSeedFrom,
  handleWhileTyping as appHandleWhileTyping,
} from "../../mobile/src/handle";
import {
  formatHandle,
  handleFrom,
  handleSchema,
  handleSeedFrom,
  handleWhileTyping,
  handleWithSuffix,
  HANDLE_FALLBACK,
  HANDLE_MAX,
  HANDLE_MIN,
} from "@/lib/players/handle";

/**
 * A handle is stated three times: here, in the app's own copy, and in
 * `public.handle_from` in the migration that backfilled every existing
 * account. Three statements of one rule is three chances to disagree,
 * and a disagreement means somebody's handle changes under them.
 *
 * So the cases live here once, and the app's copy is read off disk and
 * walked through the same list. The SQL is checked by the migration
 * probe (`scripts/probe-migrations.sh`), which runs the real function on
 * real PostgreSQL — the derivations it prints are the same ones below.
 */

/** The founder's own example, and everything that surrounds it. */
const CASES: [input: string, expected: string][] = [
  ["Steven B", "steven_b"],
  ["Steven.B", "steven_b"],
  ["Zach", "zach"],
  ["ZACH", "zach"],
  ["  Zach  ", "zach"],
  /* A run of separators collapses, so "Steven   B" cannot end up as a
     different handle from "Steven B" over whitespace nobody can see. */
  ["Steven   B", "steven_b"],
  ["a---b", "a_b"],
  ["!!!", ""],
  ["___", ""],
  ["_zach_", "zach"],
  ["Zach 2", "zach_2"],
  ["émile", "mile"],
  ["A Very Long Name Indeed That Runs On", "a_very_long_name_ind"],
];

describe("handleFrom", () => {
  it.each(CASES)("turns %j into %j", (input, expected) => {
    expect(handleFrom(input)).toBe(expected);
  });

  it("never returns something the database would refuse", () => {
    for (const [input] of CASES) {
      const derived = handleFrom(input);
      if (derived.length === 0) continue;

      expect(derived.length).toBeLessThanOrEqual(HANDLE_MAX);
      expect(derived).toMatch(/^[a-z0-9_]+$/);
      /* Truncation must not leave a trailing separator behind. */
      expect(derived.endsWith("_")).toBe(false);
    }
  });
});

describe("handleSeedFrom", () => {
  it("falls back when a name leaves nothing behind", () => {
    expect(handleSeedFrom("!!!")).toBe(HANDLE_FALLBACK);
    expect(handleSeedFrom("")).toBe(HANDLE_FALLBACK);
    /* Too short is as unusable as empty: the column demands three. */
    expect(handleSeedFrom("ab")).toBe(HANDLE_FALLBACK);
  });

  it("keeps a derived handle when there is one", () => {
    expect(handleSeedFrom("Steven B")).toBe("steven_b");
  });

  it("always returns something the schema accepts", () => {
    for (const [input] of CASES) {
      expect(handleSchema.safeParse({ handle: handleSeedFrom(input) }).success).toBe(
        true,
      );
    }
  });
});

/**
 * What each keystroke leaves in the field, walked as a list so the two
 * shipped bugs stay named: `handleSeedFrom` on a keystroke refilled
 * "player" the moment backspacing went below three characters, and
 * `handleFrom` ate the underscore of "steven_b" as it was typed.
 */
const TYPING_CASES: [input: string, expected: string][] = [
  /* The founder's bug: emptied must STAY empty, never "player". */
  ["", ""],
  ["p", "p"],
  ["pl", "pl"],
  /* The trailing underscore survives — "steven_b" has to be typeable. */
  ["steven_", "steven_"],
  ["steven_b", "steven_b"],
  /* Everything else is still typed straight into shape. */
  ["Steven B", "steven_b"],
  ["Steven ", "steven_"],
  ["ZACH", "zach"],
  ["a---b", "a_b"],
  ["__zach", "zach"],
  ["a__b", "a_b"],
  ["!!!", ""],
  ["A Very Long Name Indeed That Runs On", "a_very_long_name_ind"],
];

describe("handleWhileTyping", () => {
  it.each(TYPING_CASES)("leaves %j in the field as %j", (input, expected) => {
    expect(handleWhileTyping(input)).toBe(expected);
  });

  it("never invents the fallback for a short or emptied field", () => {
    /* `handleSeedFrom` answers these with "player"; the typing shaper
       must not, or the field refills itself under the backspace key. */
    expect(handleWhileTyping("")).toBe("");
    expect(handleWhileTyping("p")).toBe("p");
    expect(handleWhileTyping("!!")).toBe("");
    expect(handleSeedFrom("")).toBe(HANDLE_FALLBACK);
  });

  it("only ever shows characters the server accepts", () => {
    for (const [input] of TYPING_CASES) {
      const shown = handleWhileTyping(input);
      expect(shown.length).toBeLessThanOrEqual(HANDLE_MAX);
      if (shown.length > 0) expect(shown).toMatch(/^[a-z0-9_]+$/);
    }
  });

  it("settles to what handleFrom would store, once trailing separators go", () => {
    /* A finished handle typed through the live shaper must be the same
       string the derivation would have produced — the two must not be
       able to disagree about a handle that is actually submittable. */
    for (const [input] of CASES) {
      expect(handleWhileTyping(input).replace(/_+$/g, "")).toBe(handleFrom(input));
    }
  });
});

describe("handleWithSuffix", () => {
  it("keeps the result inside the maximum", () => {
    const long = "a_very_long_name_ind";
    expect(long).toHaveLength(HANDLE_MAX);

    for (const position of [2, 10, 100]) {
      const suffixed = handleWithSuffix(long, position);
      expect(suffixed.length).toBeLessThanOrEqual(HANDLE_MAX);
      expect(suffixed.endsWith(String(position))).toBe(true);
    }
  });

  it("does not leave a separator stranded before the number", () => {
    /* "steven_b" trimmed to seven is "steven_", and "steven_2" is fine,
       but a base ending on the underscore after the cut would read as a
       typo. Checked because the trim happens before the digits land. */
    expect(handleWithSuffix("steven_", 2)).toBe("steven2");
  });

  it("still produces something the schema accepts", () => {
    expect(
      handleSchema.safeParse({ handle: handleWithSuffix("zach", 2) }).success,
    ).toBe(true);
  });
});

describe("handleSchema", () => {
  it("accepts an ordinary handle", () => {
    expect(handleSchema.parse({ handle: "steven_b" }).handle).toBe("steven_b");
  });

  it("lowercases and trims rather than refusing", () => {
    expect(handleSchema.parse({ handle: "  Steven_B  " }).handle).toBe("steven_b");
  });

  it("refuses a space, which is the whole reason handles exist", () => {
    expect(handleSchema.safeParse({ handle: "steven b" }).success).toBe(false);
  });

  it.each(["ab", "", "-".repeat(4), "zach!", "zach.b", "a".repeat(HANDLE_MAX + 1)])(
    "refuses %j",
    (handle) => {
      expect(handleSchema.safeParse({ handle }).success).toBe(false);
    },
  );

  it("accepts the shortest and longest allowed", () => {
    expect(handleSchema.safeParse({ handle: "a".repeat(HANDLE_MIN) }).success).toBe(
      true,
    );
    expect(handleSchema.safeParse({ handle: "a".repeat(HANDLE_MAX) }).success).toBe(
      true,
    );
  });
});

describe("formatHandle", () => {
  it("writes the at-sign so no caller has to remember to", () => {
    expect(formatHandle("steven_b")).toBe("@steven_b");
  });
});

/**
 * The app is a separate package with no test runner of its own, so its
 * copy is imported here and walked through the same cases. A phone
 * deriving a different handle from the same name would show a player one
 * thing and save another. The file is deliberately free of React Native
 * imports so that this import costs nothing.
 */
describe("the app derives handles the same way", () => {
  const source = readFileSync("mobile/src/handle.ts", "utf8");

  it.each(CASES)("agrees on %j", (input, expected) => {
    expect(appHandleFrom(input)).toBe(expected);
    expect(appHandleFrom(input)).toBe(handleFrom(input));
  });

  it("agrees on the fallback", () => {
    expect(appHandleSeedFrom("!!!")).toBe(handleSeedFrom("!!!"));
    expect(appHandleSeedFrom("ab")).toBe(handleSeedFrom("ab"));
  });

  it.each(TYPING_CASES)("agrees while %j is being typed", (input, expected) => {
    expect(appHandleWhileTyping(input)).toBe(expected);
    expect(appHandleWhileTyping(input)).toBe(handleWhileTyping(input));
  });

  it("agrees on how one is written", () => {
    expect(appFormatHandle("steven_b")).toBe(formatHandle("steven_b"));
  });

  it("shares the same bounds", () => {
    expect(source).toContain(`HANDLE_MIN = ${HANDLE_MIN}`);
    expect(source).toContain(`HANDLE_MAX = ${HANDLE_MAX}`);
  });
});
