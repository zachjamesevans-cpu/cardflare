import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { isEmailConfigured, sendEmail } from "@/lib/email/client";

const MESSAGE = {
  to: "zach@example.com",
  subject: "You're on the cardflare waitlist",
  html: "<p>hi</p>",
  text: "hi",
};

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function configure() {
  process.env.RESEND_API_KEY = "re_test_key";
  process.env.CARDFLARE_FROM_EMAIL = "cardflare <hello@cardflare.gg>";
}

describe("isEmailConfigured", () => {
  it("is false when neither variable is set", () => {
    delete process.env.RESEND_API_KEY;
    delete process.env.CARDFLARE_FROM_EMAIL;

    expect(isEmailConfigured()).toBe(false);
  });

  it("requires both variables, not just one", () => {
    delete process.env.CARDFLARE_FROM_EMAIL;
    process.env.RESEND_API_KEY = "re_test_key";
    expect(isEmailConfigured()).toBe(false);

    delete process.env.RESEND_API_KEY;
    process.env.CARDFLARE_FROM_EMAIL = "hello@cardflare.gg";
    expect(isEmailConfigured()).toBe(false);
  });

  it("is true once both are set", () => {
    configure();

    expect(isEmailConfigured()).toBe(true);
  });
});

describe("sendEmail", () => {
  it("skips without calling out when unconfigured", async () => {
    delete process.env.RESEND_API_KEY;
    delete process.env.CARDFLARE_FROM_EMAIL;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(sendEmail(MESSAGE)).resolves.toEqual({
      status: "skipped",
      reason: "not-configured",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("posts the message and reports the provider id", async () => {
    configure();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: "email_123" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(sendEmail(MESSAGE)).resolves.toEqual({
      status: "sent",
      id: "email_123",
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.headers.Authorization).toBe("Bearer re_test_key");

    const body = JSON.parse(init.body);
    expect(body).toMatchObject({
      from: "cardflare <hello@cardflare.gg>",
      to: ["zach@example.com"],
      subject: MESSAGE.subject,
      html: MESSAGE.html,
      text: MESSAGE.text,
    });
  });

  it("sends the unsubscribe header when one is supplied", async () => {
    configure();
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ id: "email_1" }) });
    vi.stubGlobal("fetch", fetchMock);

    await sendEmail({ ...MESSAGE, listUnsubscribe: "mailto:hello@cardflare.gg" });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.headers["List-Unsubscribe"]).toBe("<mailto:hello@cardflare.gg>");
  });

  it("omits the header entirely when there is none", async () => {
    configure();
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ id: "email_1" }) });
    vi.stubGlobal("fetch", fetchMock);

    await sendEmail(MESSAGE);

    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).not.toHaveProperty("headers");
  });

  /*
   * The signup is already stored by the time this runs. Every failure path
   * below must resolve, never throw — a rejection would surface as a broken
   * signup for someone whose row was saved perfectly.
   */
  it("resolves rather than throwing when the provider rejects the request", async () => {
    configure();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 422,
        text: async () => "domain not verified",
      }),
    );

    await expect(sendEmail(MESSAGE)).resolves.toEqual({
      status: "failed",
      reason: "http-422",
    });
  });

  it("resolves rather than throwing when the network is down", async () => {
    configure();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));

    await expect(sendEmail(MESSAGE)).resolves.toEqual({
      status: "failed",
      reason: "network",
    });
  });

  it("resolves rather than throwing when the request times out", async () => {
    configure();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(
        Object.assign(new Error("timeout"), {
          name: "TimeoutError",
        }),
      ),
    );

    await expect(sendEmail(MESSAGE)).resolves.toEqual({
      status: "failed",
      reason: "network",
    });
  });

  it("copes with a success response that has no parseable body", async () => {
    configure();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => {
          throw new Error("not json");
        },
      }),
    );

    await expect(sendEmail(MESSAGE)).resolves.toEqual({
      status: "sent",
      id: "unknown",
    });
  });

  it("keeps provider detail out of the returned value", async () => {
    configure();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        text: async () => "API key re_live_SECRET is invalid for zach@example.com",
      }),
    );

    const result = await sendEmail(MESSAGE);

    expect(JSON.stringify(result)).not.toMatch(/re_live_SECRET|zach@example\.com/);
  });
});
