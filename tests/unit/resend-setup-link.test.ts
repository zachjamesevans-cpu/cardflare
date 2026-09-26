import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A fresh setup link for an invited store.
 *
 * The invitation's button is single-use and expires, and inviting the
 * same address again is refused. This is the founder's way to hand an
 * owner a working link the morning after.
 */

let viewer: { kind: string } = { kind: "admin" };
let store: { name: string; kind: string } | null = { name: "Dragon Den", kind: "lgs" };
let inviteEmails: string[] = ["owner@dragon.example"];
const ensureAuthUser = vi.fn();
const generateSetupLink = vi.fn();
const sendEmail = vi.fn();

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ getViewer: async () => viewer }));
vi.mock("@/lib/auth/provision", () => ({
  ensureAuthUser: (...a: unknown[]) => ensureAuthUser(...a),
}));
vi.mock("@/lib/auth/invite-link", () => ({
  generateSetupLink: (...a: unknown[]) => generateSetupLink(...a),
}));
vi.mock("@/lib/email/client", () => ({
  sendEmail: (...a: unknown[]) => sendEmail(...a),
}));
vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => ({
    from: (table: string) => ({
      select: () => ({
        eq: () =>
          table === "stores"
            ? { maybeSingle: async () => ({ data: store, error: null }) }
            : {
                order: () => ({
                  limit: async () => ({
                    data: inviteEmails.map((email) => ({ email })),
                    error: null,
                  }),
                }),
              },
      }),
    }),
  }),
}));

const { resendStoreSetupLinkAction } = await import("@/lib/stores/actions");
const { RESEND_SETUP_LINK_IDLE } = await import("@/lib/stores/schema");

const LINK =
  "https://cardflare.gg/auth/confirm?token_hash=t&type=recovery&next=%2Fwelcome";

function run() {
  const form = new FormData();
  form.set("storeId", "store-1");
  return resendStoreSetupLinkAction(RESEND_SETUP_LINK_IDLE, form);
}

beforeEach(() => {
  viewer = { kind: "admin" };
  store = { name: "Dragon Den", kind: "lgs" };
  inviteEmails = ["owner@dragon.example"];
  ensureAuthUser.mockReset().mockResolvedValue(true);
  generateSetupLink.mockReset().mockResolvedValue(LINK);
  sendEmail.mockReset().mockResolvedValue({ status: "sent", id: "e1" });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("resendStoreSetupLinkAction", () => {
  it("re-sends the invitation, with a new link, to the address it went to", async () => {
    const state = await run();

    expect(state).toEqual({
      status: "success",
      to: "owner@dragon.example",
      email: "sent",
      setupLink: null,
    });
    expect(generateSetupLink).toHaveBeenCalledWith("owner@dragon.example");
    const [message] = sendEmail.mock.calls[0];
    expect(message.to).toBe("owner@dragon.example");
    expect(message.html).toContain(LINK);
  });

  it("hands the admin the link when no email could go out", async () => {
    sendEmail.mockResolvedValue({ status: "skipped", reason: "not-configured" });
    const state = await run();

    expect(state.status === "success" && state.setupLink).toBe(LINK);
  });

  it("is the founder's alone", async () => {
    viewer = { kind: "store" };
    const state = await run();

    expect(state.status).toBe("error");
    expect(generateSetupLink).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("says so when the store has no invitation to re-send", async () => {
    inviteEmails = [];
    const state = await run();

    expect(state.status === "error" && state.message).toMatch(/no invitation/i);
    expect(sendEmail).not.toHaveBeenCalled();
  });
});
