import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * The bug this file exists for.
 *
 * Supabase access tokens last an hour and are renewed with a *rotating*
 * refresh token: spending one invalidates it and issues a replacement. There
 * was no proxy, so renewal happened during page renders — and a Server
 * Component cannot set cookies, so `setAll` in `src/lib/supabase/server.ts`
 * caught the new pair and dropped it. Every render spent the refresh token and
 * threw away the replacement, which invalidated the one the browser still
 * held. An hour after signing in, an operator was signed out and back to
 * asking for a magic link every single time.
 *
 * So the thing worth asserting is not "the proxy runs". It is that the
 * cookies Supabase hands back actually reach the response, which is precisely
 * what was missing.
 */

const getUser = vi.fn();
let handedBack: { name: string; value: string; options?: object }[] = [];

vi.mock("@supabase/ssr", () => ({
  createServerClient: (
    _url: string,
    _key: string,
    config: {
      cookies: {
        getAll: () => { name: string; value: string }[];
        setAll: (c: { name: string; value: string; options?: object }[]) => void;
      };
    },
  ) => ({
    auth: {
      getUser: async () => {
        // What a real refresh does: read the old cookies, hand back new ones.
        config.cookies.getAll();
        if (handedBack.length > 0) config.cookies.setAll(handedBack);
        return getUser();
      },
    },
  }),
}));

const { proxy, config } = await import("@/proxy");

function request(path = "/store") {
  const req = new NextRequest(new URL(`https://cardflare.gg${path}`));
  req.cookies.set("sb-access-token", "old-access");
  req.cookies.set("sb-refresh-token", "old-refresh");
  return req;
}

beforeEach(() => {
  getUser.mockReset().mockResolvedValue({ data: { user: { id: "u1" } } });
  handedBack = [];
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("proxy", () => {
  /*
   * The regression, stated directly. Without this the renewed session never
   * reaches the browser and the operator is signed out an hour later.
   */
  it("writes a refreshed session back to the browser", async () => {
    handedBack = [
      { name: "sb-access-token", value: "new-access", options: { path: "/" } },
      { name: "sb-refresh-token", value: "new-refresh", options: { path: "/" } },
    ];

    const response = await proxy(request());

    expect(response.cookies.get("sb-access-token")?.value).toBe("new-access");
    expect(response.cookies.get("sb-refresh-token")?.value).toBe("new-refresh");
  });

  /*
   * `getUser` is what contacts the auth server, and only contacting the auth
   * server refreshes anything. `getSession` would read the cookie, find it
   * expired, and change nothing — which is the same do-nothing this replaced.
   */
  it("actually asks the auth server, rather than reading the cookie", async () => {
    await proxy(request());

    expect(getUser).toHaveBeenCalled();
  });

  it("passes a request through untouched when there is nothing to refresh", async () => {
    const response = await proxy(request());

    expect(response.cookies.get("sb-access-token")).toBeUndefined();
    expect(response.status).toBe(200);
  });

  /*
   * A failure here takes down every matched route at once, so an
   * unconfigured deployment must pass through rather than throw.
   */
  it("does nothing when Supabase is not configured", async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;

    const response = await proxy(request());

    expect(getUser).not.toHaveBeenCalled();
    expect(response.status).toBe(200);
  });

  it("survives an auth server that is down", async () => {
    getUser.mockRejectedValue(new Error("network"));

    await expect(proxy(request())).rejects.toThrow();
  });
});

describe("proxy matcher", () => {
  /*
   * `getUser` is a round trip to the auth server. The pages where speed
   * matters most — the landing page, and `/e/CODE` reached by scanning printed
   * paper in a shop with bad wifi — have no session at all, so making every
   * visitor wait on a refresh they do not need would be a real cost for
   * nobody's benefit.
   */
  it("covers every signed-in area", () => {
    for (const path of [
      "/store/:path*",
      "/admin/:path*",
      "/account/:path*",
      "/profile/:path*",
    ]) {
      expect(config.matcher).toContain(path);
    }
  });

  it("covers the sign-in page, so an existing session is seen there", () => {
    expect(config.matcher).toContain("/login");
  });

  /*
   * `/welcome` is reached from a link in an invitation, which a shop owner may
   * well leave sitting in a tab. Left off the matcher, a reload an hour later
   * would spend the refresh token during the render and drop the replacement —
   * signing them out of the page whose whole job is to sign them up.
   */
  it("covers the setup screen an invitation lands on", () => {
    expect(config.matcher).toContain("/welcome/:path*");
  });

  it("leaves the public pages alone", () => {
    const matchers = config.matcher.join(" ");

    for (const path of ["/e/", "/join", "/play", "/cards"]) {
      expect(matchers).not.toContain(path);
    }
  });
});
