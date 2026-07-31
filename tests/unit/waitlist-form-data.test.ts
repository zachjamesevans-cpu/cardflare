import { describe, expect, it } from "vitest";

import {
  HONEYPOT_FIELD,
  MIN_FILL_MS,
  parseWaitlistFormData,
  RENDERED_AT_FIELD,
} from "@/lib/waitlist/form-data";

const NOW = 1_800_000_000_000;

function formData(overrides: Record<string, string> = {}, omit: string[] = []) {
  const data = new FormData();
  const fields: Record<string, string> = {
    firstName: "Zach",
    email: "zach@example.com",
    userType: "player",
    marketingConsent: "on",
    [RENDERED_AT_FIELD]: String(NOW - 60_000),
    ...overrides,
  };

  for (const [key, value] of Object.entries(fields)) {
    if (!omit.includes(key)) data.set(key, value);
  }

  return data;
}

describe("parseWaitlistFormData", () => {
  it("returns a validated submission for good input", () => {
    const result = parseWaitlistFormData(formData(), NOW);

    expect(result.kind).toBe("valid");
    expect(result).toMatchObject({
      data: { firstName: "Zach", email: "zach@example.com", userType: "player" },
    });
  });

  /*
   * An unticked box is a valid answer, not a validation failure. It was once
   * required, which meant the only email the waitlist exists to send needed
   * permission the signup had already implied.
   */
  it("accepts an absent consent checkbox and records it as false", () => {
    const result = parseWaitlistFormData(formData({}, ["marketingConsent"]), NOW);

    expect(result.kind).toBe("valid");
    expect(result).toMatchObject({ data: { marketingConsent: false } });
  });

  it("records a ticked box as true", () => {
    const result = parseWaitlistFormData(formData(), NOW);

    expect(result).toMatchObject({ data: { marketingConsent: true } });
  });

  it("reports invalid fields rather than throwing", () => {
    const result = parseWaitlistFormData(formData({ email: "nope" }), NOW);

    expect(result.kind).toBe("invalid");
    expect(result).toMatchObject({ fieldErrors: { email: expect.any(String) } });
  });

  describe("anti-spam", () => {
    it("flags a filled honeypot as a bot", () => {
      const result = parseWaitlistFormData(
        formData({ [HONEYPOT_FIELD]: "https://spam.example" }),
        NOW,
      );

      expect(result).toEqual({ kind: "bot", reason: "honeypot" });
    });

    it("ignores an empty or whitespace-only honeypot", () => {
      expect(
        parseWaitlistFormData(formData({ [HONEYPOT_FIELD]: "  " }), NOW).kind,
      ).toBe("valid");
    });

    it("flags an implausibly fast submission as a bot", () => {
      const result = parseWaitlistFormData(
        formData({ [RENDERED_AT_FIELD]: String(NOW - (MIN_FILL_MS - 1)) }),
        NOW,
      );

      expect(result).toEqual({ kind: "bot", reason: "too-fast" });
    });

    it("accepts a submission at the timing threshold", () => {
      const result = parseWaitlistFormData(
        formData({ [RENDERED_AT_FIELD]: String(NOW - MIN_FILL_MS) }),
        NOW,
      );

      expect(result.kind).toBe("valid");
    });

    it("checks the honeypot before anything else, so bots learn nothing", () => {
      const result = parseWaitlistFormData(
        formData({ [HONEYPOT_FIELD]: "x", email: "also-invalid" }),
        NOW,
      );

      expect(result).toEqual({ kind: "bot", reason: "honeypot" });
    });

    it("does not reject when the timestamp is missing or unparseable", () => {
      expect(parseWaitlistFormData(formData({}, [RENDERED_AT_FIELD]), NOW).kind).toBe(
        "valid",
      );
      expect(
        parseWaitlistFormData(formData({ [RENDERED_AT_FIELD]: "abc" }), NOW).kind,
      ).toBe("valid");
    });
  });

  it("ignores unexpected extra fields instead of storing them", () => {
    const data = formData();
    data.set("status", "admin");
    data.set("id", "00000000-0000-0000-0000-000000000000");

    const result = parseWaitlistFormData(data, NOW);

    expect(result.kind).toBe("valid");
    expect(result).toMatchObject({ data: {} });
    if (result.kind === "valid") {
      expect(result.data).not.toHaveProperty("status");
      expect(result.data).not.toHaveProperty("id");
    }
  });
});
