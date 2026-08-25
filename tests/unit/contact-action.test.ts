import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The contact action's one rule, and the reason it differs from the
 * waitlist's: the email IS the delivery. Nothing is stored, so success
 * may only be reported when the provider actually accepted the message.
 * A form that says "sent" over a message that went nowhere leaves the
 * writer believing they have been heard.
 */

const sendEmail = vi.fn();
const checkRateLimit = vi.fn();
const headerStore = new Map<string, string>();

vi.mock("next/headers", () => ({
  headers: () =>
    Promise.resolve({ get: (key: string) => headerStore.get(key) ?? null }),
}));
vi.mock("@/lib/email/client", () => ({
  sendEmail: (...a: unknown[]) => sendEmail(...a),
}));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: (...a: unknown[]) => checkRateLimit(...a),
}));

const { submitContact } = await import("@/lib/contact/actions");
const { CONTACT_IDLE, HONEYPOT_FIELD } = await import("@/lib/contact/schema");

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

const GOOD = {
  name: "Zach",
  email: "zach@example.com",
  subject: "Running cardflare at our locals",
  message: "We run One Piece on Fridays. How do we get set up?",
};

beforeEach(() => {
  sendEmail.mockReset();
  checkRateLimit.mockReset();
  headerStore.clear();
  sendEmail.mockResolvedValue({ status: "sent", id: "email-1" });
  checkRateLimit.mockReturnValue({ allowed: true, retryAfterSeconds: 0 });
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("submitContact", () => {
  it("mails the message to the contact inbox and reports sent", async () => {
    const state = await submitContact(CONTACT_IDLE, form(GOOD));

    expect(state).toEqual({ status: "sent" });

    const [message] = sendEmail.mock.calls[0] as [Record<string, string>];
    expect(message.to).toBe("info@cardflare.gg");
    expect(message.subject).toContain("Running cardflare at our locals");
    expect(message.text).toContain("We run One Piece on Fridays");
    // Hitting reply must reach the person who wrote in.
    expect(message.replyTo).toBe("zach@example.com");
  });

  it("reports an error, with the address, when the provider refuses", async () => {
    sendEmail.mockResolvedValue({ status: "failed", reason: "http-500" });

    const state = await submitContact(CONTACT_IDLE, form(GOOD));

    if (state.status !== "error") throw new Error("expected error");
    expect(state.message).toContain("info@cardflare.gg");
    // Their words come back so the message is not lost with the send.
    expect(state.values.message).toContain("We run One Piece on Fridays");
  });

  it("never claims success when email is not configured", async () => {
    sendEmail.mockResolvedValue({ status: "skipped", reason: "not-configured" });

    const state = await submitContact(CONTACT_IDLE, form(GOOD));

    expect(state.status).toBe("error");
  });

  it("shows a bot the success it expects, and sends nothing", async () => {
    const state = await submitContact(
      CONTACT_IDLE,
      form({ ...GOOD, [HONEYPOT_FIELD]: "https://spam.example" }),
    );

    expect(state).toEqual({ status: "sent" });
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("returns field errors without sending anything", async () => {
    const state = await submitContact(CONTACT_IDLE, form({ ...GOOD, email: "nope" }));

    if (state.status !== "error") throw new Error("expected error");
    expect(state.fieldErrors.email).toBeDefined();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("rate limits per client, keyed on the forwarded address", async () => {
    headerStore.set("x-forwarded-for", "203.0.113.9, 10.0.0.1");
    checkRateLimit.mockReturnValue({ allowed: false, retryAfterSeconds: 300 });

    const state = await submitContact(CONTACT_IDLE, form(GOOD));

    expect(checkRateLimit).toHaveBeenCalledWith("contact:203.0.113.9", 3, 600_000);
    expect(state.status).toBe("error");
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("checks the limit only after the form is known to be valid", async () => {
    await submitContact(CONTACT_IDLE, form({ ...GOOD, message: "" }));

    // An invalid form must not burn a slot; typos are not attacks.
    expect(checkRateLimit).not.toHaveBeenCalled();
  });
});
