import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

/**
 * Push on the phone: registration that sticks, taps that land, a badge
 * that agrees with the Inbox, and four switches that say what buzzes.
 *
 * The app has no renderer in the test run, so these pins read the
 * source. Each one is a thing that shipped broken once or would have:
 * a token the server kept pushing at after a reinstall, a message tap
 * that landed one row short of the conversation, a badge that never
 * went away, a settings screen the website had and the app did not.
 */
const read = (path: string) => readFileSync(path, "utf8");

const push = read("mobile/src/push.ts");
const app = read("mobile/App.tsx");
const router = read("mobile/src/follow-href.ts");
const inbox = read("mobile/src/screens/inbox.tsx");
const settings = read("mobile/src/screens/settings.tsx");
const api = read("mobile/src/api.ts");
const copy = read("mobile/src/push-copy.ts");

describe("registration", () => {
  it("takes a prompt flag and defaults to asking", () => {
    expect(push).toMatch(
      /registerForPush\(\s*\{ prompt \}: \{ prompt: boolean \} = \{ prompt: true \},?\s*\)/,
    );
  });

  it("never asks when told not to, and returns without a grant", () => {
    const quiet = push.indexOf("if (!existing.granted && !prompt) return;");
    const ask = push.indexOf("requestPermissionsAsync()");
    expect(quiet).toBeGreaterThan(-1);
    expect(ask).toBeGreaterThan(quiet);
  });

  it("re-registers on every launch that finds a session, without a prompt", () => {
    expect(app).toContain('import { registerForPush } from "./src/push";');
    expect(app).toContain("if (token) void registerForPush({ prompt: false });");
    /* Inside the one-shot gate effect, not the one keyed on the gate. */
    const gateEffect = app.slice(
      app.indexOf("const [seen, token] = await Promise.all"),
      app.indexOf("Signing out goes back to the front door"),
    );
    expect(gateEffect).toContain("registerForPush({ prompt: false })");
    expect(gateEffect).toContain("}, []);");
  });

  it("still asks from sign-in and welcome", () => {
    expect(read("mobile/src/screens/sign-in.tsx")).toContain(
      "await registerForPush();",
    );
    expect(read("mobile/src/screens/welcome.tsx")).toContain(
      "await registerForPush();",
    );
  });
});

describe("the badge", () => {
  it("is set by the notification handler", () => {
    expect(app).toContain("shouldSetBadge: true");
    expect(app).not.toContain("shouldSetBadge: false");
  });

  it("is set from the unread count and cleared once the Inbox has marked them read", () => {
    expect(push).toMatch(/export async function syncBadge\(unread: number\)/);
    expect(push).toContain("Notifications.setBadgeCountAsync(");
    expect(inbox).toContain('import { syncBadge } from "../push";');
    const set = inbox.indexOf("await syncBadge(unread.length);");
    const marked = inbox.indexOf("await markRead(unread);");
    const cleared = inbox.indexOf("await syncBadge(0);");
    expect(set).toBeGreaterThan(-1);
    expect(marked).toBeGreaterThan(set);
    expect(cleared).toBeGreaterThan(marked);
  });

  it("reloads on focus, so a notice that landed while away is marked read", () => {
    expect(inbox).toContain("useFocusEffect(");
  });
});

describe("the link router", () => {
  it.each([
    ["/e/<code>", 'href.startsWith("/e/")'],
    ["/local?thread=<id>", 'navigation.navigate("LocalThread", { threadId })'],
    /* Round 16: Messages is a tab, and the notices a screen behind the bell. */
    ["/local", 'navigation.navigate("Tabs", { screen: "Messages" })'],
    ["/feed", 'navigation.navigate("Tabs", { screen: "Feed" })'],
    ["/inbox", 'navigation.navigate("Inbox")'],
    ["/profile", 'navigation.navigate("Tabs", { screen: "Profile" })'],
    ["/p/<playerId>", 'navigation.navigate("PlayerProfile", { playerId })'],
    ["/s/<storeId>", 'navigation.navigate("StoreProfile", { storeId })'],
    ["/nights", 'navigation.navigate("Tabs", { screen: "Nights" })'],
  ])("opens %s on the phone", (_path, line) => {
    expect(router).toContain(line);
  });

  it("reads the thread id out of the query by hand, not through the URL polyfill", () => {
    expect(router).toContain('queryValue(href, "thread")');
    expect(router).not.toContain("new URLSearchParams");
  });

  it("keeps the website as the last door", () => {
    const fallback = router.lastIndexOf("Linking.openURL(`${API_BASE}${href}`)");
    const lastRoute = router.lastIndexOf("navigation.navigate(");
    expect(fallback).toBeGreaterThan(lastRoute);
  });

  it("is what the Inbox's rows and a push tap both go through", () => {
    expect(inbox).toContain('import { followHref } from "../follow-href";');
    expect(inbox).toContain("followHref(navigation, url)");
    expect(app).toContain("followHref(navigationRef, url)");
  });
});

describe("the switches", () => {
  it("carry the brief's words", () => {
    expect(copy).toContain('export const PUSH_HEADING = "Push notifications";');
    expect(copy).toContain(
      'export const PUSH_LINE = "On your phone. The Inbox keeps every notice either way.";',
    );
    for (const [key, label, line] of [
      [
        "offers",
        "Offers and trades",
        "Somebody offers on your Flare, or a trade is confirmed.",
      ],
      ["messages", "Messages", "A new message in a conversation."],
      [
        "nights",
        "Nights",
        "Boards opening, matches, a reminder on the day, and Flares in a room you are in.",
      ],
      [
        "social",
        "Follows and stores",
        "New followers, comments, and posts from stores you follow.",
      ],
    ]) {
      expect(copy).toContain(`key: "${key}"`);
      expect(copy).toContain(`label: "${label}"`);
      expect(copy).toContain(`line: "${line}"`);
    }
  });

  it("talk to the API the server exposes", () => {
    expect(api).toContain('call<{ prefs: PushPrefs }>("GET", "/api/v1/me/push")');
    expect(api).toContain(
      'call<{ prefs: PushPrefs }>("PUT", "/api/v1/me/push", { group, on })',
    );
  });

  it("sit right after Rooms, under the shared heading and line", () => {
    const rooms = settings.indexOf("<Title>Rooms</Title>");
    const pushCard = settings.indexOf("<PushPrefSwitches initial={prefs} />");
    const blocked = settings.indexOf("<BlockedPlayers initial={blocked} />");
    expect(rooms).toBeGreaterThan(-1);
    expect(pushCard).toBeGreaterThan(rooms);
    expect(blocked).toBeGreaterThan(pushCard);
    expect(settings).toContain("<Title>{PUSH_HEADING}</Title>");
    expect(settings).toContain("<Muted>{PUSH_LINE}</Muted>");
  });

  it("are the four groups, drawn the way the Rooms switch is", () => {
    expect(settings).toContain("PUSH_GROUPS.map(({ key, label, line })");
    expect(settings).toContain('accessibilityLabel={`${label}, ${on ? "on" : "off"}`}');
    /* The same glyph pair as the auto-post switch. */
    expect(settings.match(/name=\{\w+ \? "toggle" : "toggle-outline"\}/g)?.length).toBe(
      2,
    );
  });

  it("are optimistic and paint the truth back on a failed save", () => {
    const at = settings.indexOf("const flip = (group: PushGroup)");
    const flip = settings.slice(at, settings.indexOf("return (", at));
    const optimistic = flip.indexOf("setPrefs({ ...prefs, [group]: next });");
    const write = flip.indexOf("setPushPref(group, next)");
    const revert = flip.indexOf("[group]: !next");
    expect(optimistic).toBeGreaterThan(-1);
    expect(write).toBeGreaterThan(optimistic);
    expect(revert).toBeGreaterThan(write);
    expect(flip).toContain('setError("Could not save that. Try again in a moment.");');
  });

  it("have no literal hex and no em dash in what this round wrote", () => {
    for (const source of [push, router, copy]) {
      expect(source).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
      expect(source).not.toContain("\u2014");
    }
    const card = settings.slice(
      settings.indexOf("function PushPrefSwitches()"),
      settings.indexOf("function BlockedPlayers()"),
    );
    expect(card).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(card).not.toContain("\u2014");
  });
});
