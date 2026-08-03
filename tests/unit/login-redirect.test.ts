import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * What `/login` does for somebody who is already signed in.
 *
 * The footer's "Store sign-in" link points here unconditionally — the landing
 * page is statically prerendered, and asking who the visitor is would turn
 * every visit to the marketing site into an auth lookup. So this page answers
 * it instead, and a store owner who taps that link while signed in has to land
 * on their store rather than on a form asking them to sign in again.
 *
 * `next` is attacker-controlled here in exactly the way it is on the sign-in
 * action — a link with `?next=` is the whole shape of an open-redirect
 * phishing attempt — so the same guard has to hold on this path.
 */

const getViewer = vi.fn();
const redirect = vi.fn((path: string) => {
  // Next's redirect throws to unwind rendering; mirroring that keeps the page
  // honest, and means a missing redirect shows up as a returned element.
  throw new Error(`REDIRECT:${path}`);
});

vi.mock("next/navigation", () => ({ redirect: (p: string) => redirect(p) }));
vi.mock("@/lib/auth/session", () => ({ getViewer: () => getViewer() }));

const LoginPage = (await import("@/app/login/page")).default;

const USER = { id: "u1", email: "owner@store.example" };

/** Renders the page the way Next would, with the given query string. */
async function visit(params: Record<string, string> = {}) {
  try {
    await LoginPage({
      searchParams: Promise.resolve(params),
      params: Promise.resolve({}),
    } as never);
  } catch (error) {
    const message = (error as Error).message;
    if (message.startsWith("REDIRECT:")) return message.slice("REDIRECT:".length);
    throw error;
  }

  return null;
}

beforeEach(() => {
  getViewer.mockReset();
  redirect.mockClear();
});

describe("/login when already signed in", () => {
  it("sends a store straight to their store", async () => {
    getViewer.mockResolvedValue({ kind: "store", user: USER, storeIds: ["s1"] });

    await expect(visit()).resolves.toBe("/store");
  });

  /*
   * `/store` forwards an admin to `/admin` itself, so aiming there keeps one
   * copy of that rule rather than repeating it on this page.
   */
  it("sends an admin to the same place signing in would have", async () => {
    getViewer.mockResolvedValue({ kind: "admin", user: USER });

    await expect(visit()).resolves.toBe("/store");
  });

  it("sends an account with no store there too, where it is explained", async () => {
    getViewer.mockResolvedValue({ kind: "unaffiliated", user: USER });

    await expect(visit()).resolves.toBe("/store");
  });

  it("honours where they were originally headed", async () => {
    getViewer.mockResolvedValue({ kind: "admin", user: USER });

    await expect(visit({ next: "/admin" })).resolves.toBe("/admin");
  });

  /*
   * The reason `safeNextPath` is used rather than the raw parameter. Without
   * it, `/login?next=https://evil.example` would bounce a signed-in visitor
   * off-site through a genuine cardflare.gg link.
   */
  it("cannot be turned into an open redirect", async () => {
    getViewer.mockResolvedValue({ kind: "store", user: USER, storeIds: ["s1"] });

    for (const next of [
      "https://evil.example",
      "//evil.example",
      "/\\evil.example",
      "javascript:alert(1)",
    ]) {
      await expect(visit({ next })).resolves.toBe("/store");
    }
  });

  /* An expired link plus a live session is still a live session. */
  it("redirects even when the URL carries an error", async () => {
    getViewer.mockResolvedValue({ kind: "store", user: USER, storeIds: ["s1"] });

    await expect(visit({ error: "invalid-link" })).resolves.toBe("/store");
  });
});

describe("/login when signed out", () => {
  /*
   * The guard inverted is the obvious way to break this, and it would lock
   * everybody out of the product entirely.
   */
  it("renders the form rather than redirecting", async () => {
    getViewer.mockResolvedValue({ kind: "anonymous" });

    await expect(visit()).resolves.toBeNull();
    expect(redirect).not.toHaveBeenCalled();
  });

  it("still renders the form when a next path is present", async () => {
    getViewer.mockResolvedValue({ kind: "anonymous" });

    await expect(visit({ next: "/admin" })).resolves.toBeNull();
    expect(redirect).not.toHaveBeenCalled();
  });
});
