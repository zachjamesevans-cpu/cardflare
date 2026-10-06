import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { grantRefusal } from "@/lib/auth/grant-refusal";
import { emailsMatch as webEmailsMatch } from "@/lib/auth/signup-schema";
import { playersLine as webPlayersLine } from "@/lib/players/games-catalog";
import { emailsMatch as appEmailsMatch } from "../../mobile/src/email-confirm";
import { playersLine as appPlayersLine } from "../../mobile/src/games";
import { CLAIMED_MESSAGE, renewalLine } from "../../mobile/src/pro-copy";

/**
 * The pre-launch audit's sign-in, onboarding and App Review items, held
 * in place. Most of these are copy and wiring on screens a unit test
 * cannot render, so they are read off the source, the way the other
 * app tests in this folder do it.
 */
const read = (path: string) => readFileSync(path, "utf8");

const api = read("mobile/src/api.ts");
const app = read("mobile/App.tsx");

describe("a token refresh only signs out when the session is really over", () => {
  it("passes Supabase's bad minutes through instead of calling them a 401", () => {
    expect(grantRefusal("refresh", 200, true)).toBeNull();
    expect(grantRefusal("refresh", 429, false)).toEqual({
      status: 429,
      error: "rate-limited",
    });
    expect(grantRefusal("refresh", 502, false)).toEqual({
      status: 503,
      error: "upstream",
    });
    /* An OK with no token in it is not an answer either. */
    expect(grantRefusal("refresh", 200, false)).toEqual({
      status: 503,
      error: "upstream",
    });
  });

  it("names a rejected refresh token, and only that, invalid-refresh", () => {
    expect(grantRefusal("refresh", 400, false)).toEqual({
      status: 401,
      error: "invalid-refresh",
    });
    expect(grantRefusal("sign-in", 400, false)).toEqual({
      status: 401,
      error: "invalid-credentials",
    });
  });

  it("is what the app's refresh checks before signing out", () => {
    const refresh = api.slice(
      api.indexOf("async function refreshOnce"),
      api.indexOf("export function isRefreshRefusal"),
    );
    expect(refresh).toContain("isRefreshRefusal(result.status, result.errorCode)");
    expect(refresh).not.toContain("result.status !== 0");
    expect(api).toContain('status === 401 && errorCode === "invalid-refresh"');
    /* And a refusal forgets as much as Sign out does, without going
       through call(), which would wait on the refresh it is inside. */
    expect(refresh).toContain("forgetDeviceWithoutRefresh()");
    expect(refresh).toContain("forgetAccountLocals()");
  });
});

describe("signing out takes everything the account left on the phone", () => {
  it("clears the room, its game, the search game and the cache", () => {
    const locals = api.slice(
      api.indexOf("async function forgetAccountLocals"),
      api.indexOf("async function forgetAccountLocals") + 2000,
    );
    for (const key of [
      "SESSION_KEY",
      "LAST_ROOM_KEY",
      "LAST_ROOM_GAME_KEY",
      "SEARCH_GAME_KEY",
    ]) {
      expect(locals).toContain(`deleteItemAsync(${key})`);
    }
    expect(locals).toContain("clearCache()");
    /* Recent searches ride the cache's prefix, so clearCache is enough. */
    expect(read("mobile/src/recent-search-list.ts")).toContain(
      'const PREFIX = "cardflare.cache.v2.recent-searches"',
    );
  });

  it("forgets the last push tap so the next account is not carried to it", () => {
    const listener = app.slice(app.indexOf("onSignedOut(() => {"));
    expect(listener.slice(0, 800)).toContain(
      "Notifications.clearLastNotificationResponseAsync()",
    );
  });
});

describe("sign-up", () => {
  it("asks for the email twice, with the same rule on both platforms", () => {
    const cases: [string, string][] = [
      ["zach@x.com", "zach@x.com"],
      ["Zach@X.com ", "zach@x.com"],
      ["zach@x.com", "zack@x.com"],
      ["", ""],
    ];
    for (const [email, confirm] of cases) {
      expect(appEmailsMatch(email, confirm)).toBe(webEmailsMatch(email, confirm));
    }
    expect(webEmailsMatch("Zach@X.com ", "zach@x.com")).toBe(true);
    expect(webEmailsMatch("", "")).toBe(false);

    const welcome = read("mobile/src/screens/welcome.tsx");
    expect(welcome).toContain('placeholder="Confirm email"');
    expect(welcome).toContain("disabled={!emailsAgree}");

    const form = read("src/components/auth/signup-form.tsx");
    expect(form).toContain('name="confirmEmail"');
    expect(form).toContain("<SubmitButton blocked={!emailsAgree} />");
    /* And the server says it too: a Server Action is a public endpoint. */
    expect(read("src/lib/auth/actions.ts")).toContain(
      'emailsMatch(email, text(formData, "confirmEmail"))',
    );
  });

  it("says what the person agrees to, with both documents a tap away", () => {
    const welcome = read("mobile/src/screens/welcome.tsx");
    expect(welcome).toContain("By creating an account you agree to the");
    expect(welcome).toContain("including zero tolerance for abusive content.");
    expect(welcome).toContain("Linking.openURL(`${API_BASE}/terms`)");
    expect(welcome).toContain("Linking.openURL(`${API_BASE}/privacy`)");

    const form = read("src/components/auth/signup-form.tsx");
    expect(form).toContain("By creating an account you agree to the");
    expect(form).toContain('href="/terms"');
    expect(form).toContain('href="/privacy"');
  });

  it("is backed by terms that rule out abuse and act on reports in a day", () => {
    const terms = read("src/app/terms/page.tsx");
    expect(terms).toMatch(/zero tolerance for objectionable/i);
    expect(terms).toContain("within 24 hours");
  });

  it("never traps a new account on the games question", () => {
    const welcome = read("mobile/src/screens/welcome.tsx");
    expect(welcome).toContain("setSaveFailed(true)");
    expect(welcome).toContain("Continue without saving");
  });

  it("names the games under the pitch, from the one list", () => {
    expect(appPlayersLine()).toBe(webPlayersLine());
    expect(webPlayersLine()).toBe(
      "For One Piece, Riftbound, Lorcana, Magic, Pokémon and Flesh & Blood players",
    );
    expect(read("mobile/src/screens/welcome.tsx")).toContain("{playersLine()}.");
    expect(read("src/app/signup/page.tsx")).toContain("{playersLine()}.");
  });
});

describe("sign-in", () => {
  it("has a way across to sign-up, and says where the reset goes", () => {
    const signIn = read("mobile/src/screens/sign-in.tsx");
    expect(signIn).toContain("New here?");
    expect(signIn).toContain("Create an account");
    expect(signIn).toContain("Reset password on cardflare.gg");
    expect(app).toContain(
      'onCreateAccount={() => navigation.replace("CreateAccount")}',
    );
  });
});

describe("guests", () => {
  it("get a public sample from the feed, not an empty list", () => {
    const route = read("src/app/api/v1/feed/route.ts");
    expect(route).toContain("guestSampleFeed(device)");
    expect(route).not.toContain("if (!account) return Response.json({ items: [] });");

    const repo = read("src/lib/feed/repository.ts");
    const sample = repo.slice(repo.indexOf("export async function guestSampleFeed"));
    /* Area Flares only: posted to the public on purpose. */
    expect(sample).toContain('.is("event_id", null)');
    expect(sample).toContain("yours: false");
  });

  it("see how it works and two ways in, and never a Post a Flare prompt", () => {
    const home = read("mobile/src/screens/home.tsx");
    expect(home).toContain("How cardflare works");
    expect(home).toContain('label="Create account"');
    expect(home).toContain('label="Scan a store code"');
    for (const empty of [
      '{!guest && hydrated && shown.length === 0 && tab === "mine" && (',
      '{!guest && hydrated && shown.length === 0 && tab === "nearby" && (',
      "{!guest && hydrated && feed.length < 3 && (",
    ]) {
      expect(home).toContain(empty);
    }
    /* A guest's post offers nothing it cannot do: every door is sign-up. */
    expect(home).toContain("post={{ ...postRef(item), yours: true }}");
    expect(home).toContain("onMessage={toSignUp}");
  });
});

describe("App Review readiness", () => {
  it("does not point players at an outside purchase", () => {
    const describe = api.slice(
      api.indexOf("export function describeError"),
      api.indexOf("export function describeError") + 1200,
    );
    expect(describe).not.toContain("cardflare.gg/store");
    expect(describe).not.toContain("free trial");
  });

  it("says truthfully what location is used for", () => {
    const config = read("mobile/app.json");
    expect(config).not.toContain("never stored");
    expect(config).toContain("Only your approximate area (ZIP code) is saved");
  });

  it("has a crash screen that can recover and keeps the raw error out of sight", () => {
    const guard = app.slice(app.indexOf("class StartupGuard"));
    expect(guard).not.toContain("while starting");
    expect(guard).toContain("Try again");
    expect(guard).toContain("this.setState({ error: null, details: false })");
    expect(guard).toContain('"Details"');
  });

  it("finishes in-app purchases at launch, not only on the Pro screen", () => {
    expect(app).toContain("startProSync()");
    const pro = read("mobile/src/pro.ts");
    const confirm = pro.slice(pro.indexOf("async function confirmAll"));
    expect(confirm).toContain("await syncApplePurchase(original)");
    expect(confirm).toContain("finishTransaction({ purchase, isConsumable: false })");
    expect(confirm).toContain('caught.code === "claimed"');
  });

  it("says plainly when the Apple subscription is another account's", () => {
    expect(CLAIMED_MESSAGE).toContain("different cardflare account");
    expect(read("mobile/src/screens/pro.tsx")).toContain("setMessage(CLAIMED_MESSAGE)");
    expect(read("mobile/src/screens/settings.tsx")).toContain("? CLAIMED_MESSAGE");
  });

  it("gives a Pro subscriber the way to manage it, and the date", () => {
    const screen = read("mobile/src/screens/pro.tsx");
    expect(screen).toContain('label="Manage subscription"');
    expect(screen).toContain("Linking.openURL(APPLE_SUBSCRIPTIONS_URL)");
    expect(
      renewalLine({
        source: "apple",
        renewsAt: "2026-11-12T12:00:00Z",
        cancelAtPeriodEnd: false,
      }),
    ).toBe("Renews November 12, 2026");
    expect(
      renewalLine({
        source: "apple",
        renewsAt: "2026-11-12T12:00:00Z",
        cancelAtPeriodEnd: true,
      }),
    ).toBe("Ends November 12, 2026");
    expect(renewalLine(null)).toBeNull();
    expect(
      renewalLine({ source: "apple", renewsAt: null, cancelAtPeriodEnd: false }),
    ).toBeNull();
  });

  it("does not tell a signed-in player offline to sign in", () => {
    const screen = read("mobile/src/screens/pro.tsx");
    expect(screen).toContain("Could not reach cardflare to check your account.");
    expect(screen).toContain("(await storedAccessToken())");
  });

  it("keeps Delete account in Settings when the account read fails", () => {
    const settings = read("mobile/src/screens/settings.tsx");
    expect(settings).toContain("<DeleteAccount handle={deleteFallback.handle} />");
    expect(settings).toContain(
      "function DeleteAccount({ handle }: { handle: string | null })",
    );
    expect(settings).not.toContain("CardFlare");
  });
});
