import { describe, expect, it } from "vitest";

import {
  HONEYPOT_FIELD,
  MESSAGE_MAX,
  MIN_FILL_MS,
  RENDERED_AT_FIELD,
  parseContactFormData,
} from "@/lib/contact/schema";

/**
 * The contact form's parsing, which is also its anti-spam. Kept pure so
 * it tests without a server: a bot is caught before validation, a human
 * mistake comes back with their words intact, and nothing over the
 * length caps gets through to an inbox.
 */

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

const GOOD = {
  name: "Zach",
  email: "Zach@Example.COM",
  subject: "Running cardflare at our locals",
  message: "We run One Piece on Fridays. How do we get set up?",
};

describe("parseContactFormData", () => {
  it("accepts a filled-in form and normalises the email", () => {
    const parsed = parseContactFormData(form(GOOD));

    expect(parsed).toEqual({
      kind: "valid",
      data: {
        name: "Zach",
        email: "zach@example.com",
        subject: "Running cardflare at our locals",
        message: "We run One Piece on Fridays. How do we get set up?",
      },
    });
  });

  it("treats a filled honeypot as a bot, before anything else is judged", () => {
    // Deliberately also invalid: the honeypot must win, so the response
    // cannot tell a script which of its fields were wrong.
    const parsed = parseContactFormData(
      form({ ...GOOD, email: "nope", [HONEYPOT_FIELD]: "https://spam.example" }),
    );

    expect(parsed).toEqual({ kind: "bot", reason: "honeypot" });
  });

  it("treats an impossibly fast submission as a bot", () => {
    const now = 1_000_000;
    const parsed = parseContactFormData(
      form({ ...GOOD, [RENDERED_AT_FIELD]: String(now - MIN_FILL_MS + 1) }),
      now,
    );

    expect(parsed).toEqual({ kind: "bot", reason: "too-fast" });
  });

  it("lets a considered submission through", () => {
    const now = 1_000_000;
    const parsed = parseContactFormData(
      form({ ...GOOD, [RENDERED_AT_FIELD]: String(now - MIN_FILL_MS - 1) }),
      now,
    );

    expect(parsed.kind).toBe("valid");
  });

  it("ignores a missing or unparseable timestamp rather than blocking", () => {
    // Someone with JavaScript disabled submits no timestamp at all; they
    // are a person, not a bot.
    expect(parseContactFormData(form(GOOD)).kind).toBe("valid");
    expect(
      parseContactFormData(form({ ...GOOD, [RENDERED_AT_FIELD]: "soon" })).kind,
    ).toBe("valid");
  });

  it("names the empty required fields and echoes what was typed", () => {
    const parsed = parseContactFormData(
      form({ name: "", email: "", subject: "Hi", message: "" }),
    );

    if (parsed.kind !== "invalid") throw new Error("expected invalid");
    expect(parsed.fieldErrors.name).toBeDefined();
    expect(parsed.fieldErrors.email).toBeDefined();
    expect(parsed.fieldErrors.message).toBeDefined();
    expect(parsed.values.subject).toBe("Hi");
  });

  it("rejects a malformed email", () => {
    const parsed = parseContactFormData(form({ ...GOOD, email: "zach@" }));

    if (parsed.kind !== "invalid") throw new Error("expected invalid");
    expect(parsed.fieldErrors.email).toBeDefined();
  });

  it("stands in for an empty subject rather than mailing a blank line", () => {
    const parsed = parseContactFormData(form({ ...GOOD, subject: "   " }));

    if (parsed.kind !== "valid") throw new Error("expected valid");
    expect(parsed.data.subject).toBe("No subject");
  });

  it("refuses a message past the cap", () => {
    const parsed = parseContactFormData(
      form({ ...GOOD, message: "x".repeat(MESSAGE_MAX + 1) }),
    );

    if (parsed.kind !== "invalid") throw new Error("expected invalid");
    expect(parsed.fieldErrors.message).toBeDefined();
  });

  it("accepts a message exactly at the cap", () => {
    const parsed = parseContactFormData(
      form({ ...GOOD, message: "x".repeat(MESSAGE_MAX) }),
    );

    expect(parsed.kind).toBe("valid");
  });
});
