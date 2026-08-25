import { describe, expect, it } from "vitest";

import { waitlistConfirmationEmail } from "@/lib/email/waitlist-confirmation";

const ORIGIN = "https://cardflare.gg";

describe("waitlistConfirmationEmail", () => {
  it("addresses the recipient by name in both formats", () => {
    const message = waitlistConfirmationEmail("Zach", "zach@example.com", ORIGIN);

    expect(message.to).toBe("zach@example.com");
    expect(message.html).toContain("Zach");
    expect(message.text).toContain("Zach");
  });

  it("has a subject that says what it is", () => {
    const message = waitlistConfirmationEmail("Zach", "zach@example.com", ORIGIN);

    expect(message.subject).toMatch(/waitlist/i);
    expect(message.subject).toMatch(/cardflare/);
  });

  it("ships a plain-text alternative carrying the same substance", () => {
    const message = waitlistConfirmationEmail("Zach", "zach@example.com", ORIGIN);

    expect(message.text.length).toBeGreaterThan(200);
    expect(message.text).not.toContain("<");
    expect(message.text).toMatch(/on the list/i);
    expect(message.text).toMatch(/pilots/i);
  });

  /**
   * The Privacy Policy promises every email carries a way to unsubscribe.
   * This keeps the product honest about that.
   */
  it("offers a way out, in the body and as a header", () => {
    const message = waitlistConfirmationEmail("Zach", "zach@example.com", ORIGIN);

    expect(message.html).toMatch(/hello@cardflare\.gg/);
    expect(message.text).toMatch(/hello@cardflare\.gg/);
    expect(message.listUnsubscribe).toMatch(/^mailto:/);
  });

  it("escapes a name so it cannot inject markup", () => {
    const message = waitlistConfirmationEmail(
      '<script>alert("x")</script>',
      "zach@example.com",
      ORIGIN,
    );

    expect(message.html).not.toContain("<script>");
    expect(message.html).toContain("&lt;script&gt;");
  });

  it.each([
    ["ampersand", "Ben & Jerry", "Ben &amp; Jerry"],
    ["quote", 'He said "hi"', "&quot;"],
    ["apostrophe", "O'Brien", "&#39;"],
  ])("escapes %s in the name", (_label, input, expected) => {
    const message = waitlistConfirmationEmail(input, "zach@example.com", ORIGIN);

    expect(message.html).toContain(expected);
  });

  it("links back to the origin it was given", () => {
    const preview = waitlistConfirmationEmail(
      "Zach",
      "zach@example.com",
      "https://preview.vercel.app",
    );

    expect(preview.html).toContain("https://preview.vercel.app");
    expect(preview.text).toContain("https://preview.vercel.app");
  });

  it("does not promise anything the product cannot do yet", () => {
    const message = waitlistConfirmationEmail("Zach", "zach@example.com", ORIGIN);
    const body = `${message.html} ${message.text}`;

    // The app does not exist yet; the email must not imply it is usable.
    expect(body).not.toMatch(/log in|sign in|download|get started now/i);
  });
});
