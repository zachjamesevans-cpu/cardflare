import { beforeEach, describe, expect, it, vi } from "vitest";

import { resetRateLimits } from "@/lib/rate-limit";
import { submitWaitlist } from "@/lib/waitlist/actions";
import { HONEYPOT_FIELD, RENDERED_AT_FIELD } from "@/lib/waitlist/form-data";
import { WAITLIST_IDLE } from "@/lib/waitlist/schema";

const insertWaitlistSignup = vi.fn();
const isSupabaseConfigured = vi.fn(() => true);
const sendEmail = vi.fn();
let requestHeaders: Record<string, string> = {};

vi.mock("next/headers", () => ({
  headers: async () => ({
    get: (name: string) => requestHeaders[name.toLowerCase()] ?? null,
  }),
}));

/** Runs the scheduled work immediately so tests can observe it. */
vi.mock("next/server", () => ({
  after: (callback: () => unknown) => callback(),
}));

vi.mock("@/lib/email/client", () => ({
  isEmailConfigured: () => true,
  sendEmail: (...args: unknown[]) => sendEmail(...args),
}));

vi.mock("@/lib/waitlist/repository", () => ({
  insertWaitlistSignup: (...args: unknown[]) => insertWaitlistSignup(...args),
}));

vi.mock("@/lib/supabase/admin", () => ({
  isSupabaseConfigured: () => isSupabaseConfigured(),
  getSupabaseAdmin: () => {
    throw new Error("not used in this test");
  },
}));

function formData(overrides: Record<string, string> = {}, omit: string[] = []) {
  const data = new FormData();
  const fields: Record<string, string> = {
    firstName: "Zach",
    email: "Zach@Example.com",
    userType: "player",
    marketingConsent: "on",
    [RENDERED_AT_FIELD]: String(Date.now() - 60_000),
    ...overrides,
  };

  for (const [key, value] of Object.entries(fields)) {
    if (!omit.includes(key)) data.set(key, value);
  }

  return data;
}

const submit = (data: FormData) => submitWaitlist(WAITLIST_IDLE, data);

beforeEach(() => {
  resetRateLimits();
  insertWaitlistSignup.mockReset().mockResolvedValue({ outcome: "created" });
  sendEmail.mockReset().mockResolvedValue({ status: "sent", id: "email_1" });
  isSupabaseConfigured.mockReset().mockReturnValue(true);
  requestHeaders = { "x-forwarded-for": `10.0.0.${Math.floor(Math.random() * 250)}` };
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("submitWaitlist", () => {
  it("stores a valid submission and confirms success", async () => {
    const result = await submit(formData());

    expect(result).toEqual({ status: "success", alreadyRegistered: false });
    expect(insertWaitlistSignup).toHaveBeenCalledOnce();
  });

  it("persists the normalized email, not what was typed", async () => {
    await submit(formData({ email: "  ZACH@Example.COM  " }));

    expect(insertWaitlistSignup).toHaveBeenCalledWith(
      expect.objectContaining({ email: "zach@example.com" }),
      null,
    );
  });

  it("reports a duplicate as a friendly success, not an error", async () => {
    insertWaitlistSignup.mockResolvedValue({ outcome: "duplicate" });

    const result = await submit(formData());

    expect(result).toEqual({ status: "success", alreadyRegistered: true });
  });

  it("returns field errors for invalid input without touching the database", async () => {
    const result = await submit(formData({ email: "not-an-email" }));

    expect(result.status).toBe("error");
    expect(result).toMatchObject({ fieldErrors: { email: expect.any(String) } });
    expect(insertWaitlistSignup).not.toHaveBeenCalled();
  });

  it("echoes back what the user typed so a failed submit does not clear the form", async () => {
    const result = await submit(
      formData({
        email: "not-an-email",
        firstName: "Zach",
        city: "Austin",
        userType: "store",
      }),
    );

    expect(result).toMatchObject({
      status: "error",
      values: {
        firstName: "Zach",
        email: "not-an-email",
        city: "Austin",
        userType: "store",
      },
    });
  });

  it("never echoes back marketing consent", async () => {
    const result = await submit(formData({ email: "bad" }));

    expect(result.status).toBe("error");
    if (result.status === "error") {
      expect(result.values).not.toHaveProperty("marketingConsent");
    }
  });

  it("repopulates the form when the database fails after a valid parse", async () => {
    insertWaitlistSignup.mockRejectedValue(new Error("connection refused"));

    const result = await submit(formData({ city: "Austin" }));

    expect(result).toMatchObject({
      status: "error",
      values: { firstName: "Zach", email: "zach@example.com", city: "Austin" },
    });
  });

  it("rejects a submission that did not consent", async () => {
    const result = await submit(formData({}, ["marketingConsent"]));

    expect(result.status).toBe("error");
    expect(insertWaitlistSignup).not.toHaveBeenCalled();
  });

  it("rejects a user type that is not on the allow-list", async () => {
    const result = await submit(formData({ userType: "administrator" }));

    expect(result.status).toBe("error");
    expect(insertWaitlistSignup).not.toHaveBeenCalled();
  });

  it("silently discards honeypot submissions without storing them", async () => {
    const result = await submit(formData({ [HONEYPOT_FIELD]: "spam" }));

    expect(result).toEqual({ status: "success", alreadyRegistered: false });
    expect(insertWaitlistSignup).not.toHaveBeenCalled();
  });

  it("returns a safe message when the database fails, leaking no detail", async () => {
    insertWaitlistSignup.mockRejectedValue(
      new Error('duplicate key value violates unique constraint on "secret_table"'),
    );

    const result = await submit(formData());

    expect(result.status).toBe("error");
    if (result.status === "error") {
      expect(result.message).not.toMatch(/secret_table|constraint|duplicate key/);
      expect(result.message).toMatch(/try again/i);
    }
  });

  it("fails safely when Supabase is not configured", async () => {
    isSupabaseConfigured.mockReturnValue(false);

    const result = await submit(formData());

    expect(result.status).toBe("error");
    expect(insertWaitlistSignup).not.toHaveBeenCalled();
  });

  it("rate limits repeated submissions from one address", async () => {
    requestHeaders = { "x-forwarded-for": "203.0.113.9" };

    for (let attempt = 0; attempt < 5; attempt++) {
      expect((await submit(formData())).status).toBe("success");
    }

    const blocked = await submit(formData());

    expect(blocked.status).toBe("error");
    if (blocked.status === "error") {
      expect(blocked.message).toMatch(/too many/i);
    }
  });

  it("does not let one flooding address block a different one", async () => {
    requestHeaders = { "x-forwarded-for": "203.0.113.10" };
    for (let attempt = 0; attempt < 6; attempt++) await submit(formData());

    requestHeaders = { "x-forwarded-for": "203.0.113.11" };

    expect((await submit(formData())).status).toBe("success");
  });

  describe("confirmation email", () => {
    it("sends one to a newly stored signup", async () => {
      await submit(formData());

      expect(sendEmail).toHaveBeenCalledOnce();
      expect(sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: "zach@example.com",
          subject: expect.stringMatching(/waitlist/i),
        }),
      );
    });

    /*
     * Emailing on duplicates would let anyone flood a stranger's inbox by
     * resubmitting their address. Sending only on insert makes it unrepeatable.
     */
    it("sends nothing when the address is already on the list", async () => {
      insertWaitlistSignup.mockResolvedValue({ outcome: "duplicate" });

      await submit(formData());

      expect(sendEmail).not.toHaveBeenCalled();
    });

    it("cannot be used to repeatedly email one address", async () => {
      insertWaitlistSignup
        .mockResolvedValueOnce({ outcome: "created" })
        .mockResolvedValue({ outcome: "duplicate" });

      for (let attempt = 0; attempt < 4; attempt++) {
        await submit(formData());
      }

      expect(sendEmail).toHaveBeenCalledOnce();
    });

    it("sends nothing for a rejected submission", async () => {
      await submit(formData({ email: "not-an-email" }));

      expect(sendEmail).not.toHaveBeenCalled();
    });

    it("sends nothing for a honeypot submission", async () => {
      await submit(formData({ [HONEYPOT_FIELD]: "spam" }));

      expect(sendEmail).not.toHaveBeenCalled();
    });

    it("still reports success when the email provider fails", async () => {
      sendEmail.mockResolvedValue({ status: "failed", reason: "http-500" });

      const result = await submit(formData());

      expect(result).toEqual({ status: "success", alreadyRegistered: false });
    });

    /*
     * The row is already stored by the time the email runs. A throw from that
     * path must never turn a good signup into a visible failure.
     */
    it("still reports success when the email path throws outright", async () => {
      sendEmail.mockRejectedValue(new Error("provider exploded"));

      const result = await submit(formData());

      expect(result).toEqual({ status: "success", alreadyRegistered: false });
      expect(insertWaitlistSignup).toHaveBeenCalledOnce();
    });
  });

  it("records the originating page as the signup source", async () => {
    requestHeaders = {
      "x-forwarded-for": "203.0.113.12",
      referer: "https://cardflare.gg/?utm=x",
    };

    await submit(formData());

    expect(insertWaitlistSignup).toHaveBeenCalledWith(
      expect.anything(),
      "cardflare.gg/",
    );
  });
});
