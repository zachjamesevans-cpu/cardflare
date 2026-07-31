import { describe, expect, it } from "vitest";

import {
  normalizeEmail,
  toFieldErrors,
  USER_TYPES,
  waitlistSubmissionSchema,
} from "@/lib/waitlist/schema";

function validInput(overrides: Record<string, unknown> = {}) {
  return {
    firstName: "Zach",
    email: "zach@example.com",
    userType: "player",
    marketingConsent: true,
    ...overrides,
  };
}

describe("normalizeEmail", () => {
  it("lowercases and trims", () => {
    expect(normalizeEmail("  Zach@Example.COM  ")).toBe("zach@example.com");
  });

  it("treats case-different addresses as the same person", () => {
    expect(normalizeEmail("ZACH@EXAMPLE.COM")).toBe(normalizeEmail("zach@example.com"));
  });

  it("preserves plus-addressing and dots, which are distinct inboxes", () => {
    expect(normalizeEmail("Zach+Locals@Example.com")).toBe("zach+locals@example.com");
    expect(normalizeEmail("first.last@example.com")).toBe("first.last@example.com");
  });

  it("is idempotent", () => {
    const once = normalizeEmail(" Mixed@Case.io ");
    expect(normalizeEmail(once)).toBe(once);
  });
});

describe("waitlistSubmissionSchema", () => {
  it("accepts a minimal valid submission", () => {
    const result = waitlistSubmissionSchema.safeParse(validInput());

    expect(result.success).toBe(true);
    expect(result.data?.email).toBe("zach@example.com");
    expect(result.data?.userType).toBe("player");
  });

  it("normalizes the email as part of parsing", () => {
    const result = waitlistSubmissionSchema.safeParse(
      validInput({ email: "  ZACH@Example.COM " }),
    );

    expect(result.data?.email).toBe("zach@example.com");
  });

  it("trims the first name", () => {
    const result = waitlistSubmissionSchema.safeParse(
      validInput({ firstName: "  Zach  " }),
    );

    expect(result.data?.firstName).toBe("Zach");
  });

  it.each([
    ["missing @", "not-an-email"],
    ["missing domain", "zach@"],
    ["empty", ""],
    ["whitespace only", "   "],
  ])("rejects an invalid email (%s)", (_label, email) => {
    const result = waitlistSubmissionSchema.safeParse(validInput({ email }));

    expect(result.success).toBe(false);
    expect(toFieldErrors(result.error!).email).toBeDefined();
  });

  it("rejects an email longer than the column allows", () => {
    const email = `${"a".repeat(250)}@example.com`;
    const result = waitlistSubmissionSchema.safeParse(validInput({ email }));

    expect(result.success).toBe(false);
  });

  it("requires a first name", () => {
    const result = waitlistSubmissionSchema.safeParse(validInput({ firstName: "  " }));

    expect(result.success).toBe(false);
    expect(toFieldErrors(result.error!).firstName).toBeDefined();
  });

  it.each(USER_TYPES.map((type) => type.value))("accepts user type %s", (userType) => {
    expect(waitlistSubmissionSchema.safeParse(validInput({ userType })).success).toBe(
      true,
    );
  });

  it.each([
    ["unknown value", "hacker"],
    ["empty", ""],
    ["wrong case", "Player"],
  ])("rejects an invalid user type (%s)", (_label, userType) => {
    const result = waitlistSubmissionSchema.safeParse(validInput({ userType }));

    expect(result.success).toBe(false);
    expect(toFieldErrors(result.error!).userType).toBeDefined();
  });

  it("accepts either answer to marketing consent", () => {
    for (const marketingConsent of [true, false]) {
      const result = waitlistSubmissionSchema.safeParse(
        validInput({ marketingConsent }),
      );
      expect(result.success).toBe(true);
      expect(result.data?.marketingConsent).toBe(marketingConsent);
    }
  });

  // Still a boolean, not a checkbox string. `parseWaitlistFormData` coerces
  // before it gets here, and the column is boolean.
  it("rejects a consent value that is not a boolean", () => {
    for (const marketingConsent of [undefined, "on", null]) {
      const result = waitlistSubmissionSchema.safeParse(
        validInput({ marketingConsent }),
      );
      expect(result.success).toBe(false);
    }
  });

  it("collapses blank optional fields to null", () => {
    const result = waitlistSubmissionSchema.safeParse(
      validInput({ city: "   ", storeName: "", comment: undefined }),
    );

    expect(result.data?.city).toBeNull();
    expect(result.data?.storeName).toBeNull();
    expect(result.data?.comment).toBeNull();
  });

  it("keeps and trims populated optional fields", () => {
    const result = waitlistSubmissionSchema.safeParse(
      validInput({ city: "  Austin ", region: "TX", primaryGame: "One Piece" }),
    );

    expect(result.data?.city).toBe("Austin");
    expect(result.data?.region).toBe("TX");
    expect(result.data?.primaryGame).toBe("One Piece");
  });

  it("rejects an over-long comment", () => {
    const result = waitlistSubmissionSchema.safeParse(
      validInput({ comment: "x".repeat(501) }),
    );

    expect(result.success).toBe(false);
    expect(toFieldErrors(result.error!).comment).toBeDefined();
  });
});

describe("toFieldErrors", () => {
  it("returns one message per field, keyed by field name", () => {
    const result = waitlistSubmissionSchema.safeParse({
      firstName: "",
      email: "nope",
      userType: "bogus",
      marketingConsent: "not-a-boolean",
    });

    const errors = toFieldErrors(result.error!);

    expect(Object.keys(errors).sort()).toEqual(
      ["email", "firstName", "marketingConsent", "userType"].sort(),
    );
    expect(Object.values(errors).every((value) => typeof value === "string")).toBe(
      true,
    );
  });
});
