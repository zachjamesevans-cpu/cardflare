import { describe, expect, it } from "vitest";

import { normalizedCardSchema } from "@/lib/cards/domain";

/*
 * A colour is capped at 24 characters by the shared card shape. A source
 * once sent six colours as one space-separated string; the fix was to split
 * the value in the adapter, not to raise the limit. A single token that long
 * is not a colour, and must still be rejected — otherwise the next
 * unexpected shape gets waved through instead of recorded.
 */
describe("colours", () => {
  it("still rejects one token too long to be a colour", () => {
    const result = normalizedCardSchema.safeParse({
      canonicalCardNumber: "OP01-001",
      exactName: "Test",
      colors: ["Blue-Green-Purple-Red-Black-Yellow"],
    });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues.map((issue) => issue.path.join("."))).toContain(
      "colors.0",
    );
  });
});
