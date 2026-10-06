import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  PUSH_GROUPS,
  PUSH_HEADING,
  PUSH_LINE,
  groupForKind,
} from "@/lib/notifications/push-prefs";

/**
 * Push, on both platforms, in the same round.
 *
 * Four switches on the settings page and the settings screen, the same
 * words on each, the phone re-registering on every launch, a badge that
 * says what the Inbox holds, and a tap that lands on the screen the
 * notice was about. The founder's standing instruction is that every
 * change ships to the website and the app alike, so this reads both
 * sources and holds them to one another and to the server that gates
 * the buzz. Whether a switch looks right is the visual pass.
 */

const read = (path: string) =>
  readFileSync(resolve(import.meta.dirname, "../..", path), "utf8");

const webCopySource = read("src/lib/notifications/push-prefs.ts");
const appCopySource = read("mobile/src/push-copy.ts");

const webSettings = read("src/app/profile/settings/page.tsx");
const webToggles = read("src/components/players/push-pref-toggles.tsx");
const appSettings = read("mobile/src/screens/settings.tsx");

const appRoot = read("mobile/App.tsx");
const appPush = read("mobile/src/push.ts");
const appRouter = read("mobile/src/follow-href.ts");
const appInbox = read("mobile/src/screens/inbox.tsx");
const appApi = read("mobile/src/api.ts");

const notify = read("src/lib/notifications/notify.ts");
const pushRoute = read("src/app/api/v1/me/push/route.ts");

/** The exact strings the brief pins. */
const PINNED = {
  heading: "Push notifications",
  line: "On your phone. The Inbox keeps every notice either way.",
  groups: [
    {
      key: "offers",
      label: "Offers and trades",
      line: "Somebody offers on your Flare, or a trade is confirmed.",
    },
    { key: "messages", label: "Messages", line: "A new message in a conversation." },
    {
      key: "nights",
      label: "Nights",
      line: "Boards opening, matches, a reminder on the day, and Flares in a room you are in.",
    },
    {
      key: "social",
      label: "Follows and stores",
      line: "New followers, comments, and posts from stores you follow.",
    },
  ],
} as const;

/**
 * A declaration, whitespace folded, so the two files can be held equal
 * whatever Prettier's line breaks did to each. Walks from the export
 * to the first `;` or closing brace at the top level.
 */
function body(source: string, name: string): string {
  const start = source.search(new RegExp(`export (?:const|type|interface) ${name}\\b`));
  if (start < 0) throw new Error(`${name} is not exported`);
  let depth = 0;
  let quote: string | null = null;
  for (let i = start; i < source.length; i += 1) {
    const char = source[i];
    if (quote) {
      if (char === "\\") i += 1;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'" || char === "`") quote = char;
    else if (char === "{" || char === "[" || char === "(") depth += 1;
    else if (char === "}" || char === "]" || char === ")") {
      depth -= 1;
      if (depth === 0 && source.slice(start, i).includes("interface ")) {
        return source
          .slice(start, i + 1)
          .replace(/\s+/g, " ")
          .trim();
      }
    } else if (char === ";" && depth === 0) {
      return source
        .slice(start, i + 1)
        .replace(/\s+/g, " ")
        .trim();
    }
  }
  throw new Error(`${name} never ends`);
}

describe("push copy, both platforms", () => {
  it("the web copy is what the brief pinned", () => {
    expect(PUSH_HEADING).toBe(PINNED.heading);
    expect(PUSH_LINE).toBe(PINNED.line);
    expect(PUSH_GROUPS).toEqual(PINNED.groups);
  });

  it("the app's copy file carries the same bodies as the web's", () => {
    for (const name of [
      "PushGroup",
      "PushPrefs",
      "PUSH_GROUPS",
      "PUSH_HEADING",
      "PUSH_LINE",
    ]) {
      expect(body(appCopySource, name), name).toBe(body(webCopySource, name));
    }
  });

  it("the app's copy file has no server import", () => {
    expect(appCopySource).not.toMatch(/from ["']/);
  });

  it("every label and line is in the app's copy file verbatim", () => {
    expect(appCopySource).toContain(`"${PINNED.heading}"`);
    expect(appCopySource).toContain(`"${PINNED.line}"`);
    for (const group of PINNED.groups) {
      expect(appCopySource).toContain(`"${group.label}"`);
      expect(appCopySource).toContain(`"${group.line}"`);
    }
  });
});

describe("the website's settings page", () => {
  it("has a notifications card right after the rooms card, in both orders", () => {
    expect(webSettings).toMatch(/<Card key="notifications"/);
    expect(webSettings).toContain("{PUSH_HEADING}");
    expect(webSettings).toContain("{PUSH_LINE}");
    expect(webSettings).toMatch(
      /import \{ PUSH_HEADING, PUSH_LINE \} from "@\/lib\/notifications\/push-prefs"/,
    );
    expect(webSettings).toContain(
      "<PushPrefToggles initial={await pushPrefsFor(playerId)} />",
    );
    const orders = webSettings.match(/roomsCard,\s*notificationsCard,/g) ?? [];
    expect(orders).toHaveLength(2);
  });

  it("draws the four switches from the copy, optimistic, truth back on error", () => {
    expect(webToggles).toMatch(/^"use client";/);
    expect(webToggles).toContain("PUSH_GROUPS.map(");
    expect(webToggles).toContain("useOptimistic(");
    expect(webToggles).toContain("setPushPrefAction(key, next)");
    expect(webToggles).toContain("if (result.ok) setTruth(result.prefs)");
    expect(webToggles).toMatch(/role="switch"/);
    expect(webToggles).toMatch(/role="alert"/);
  });
});

describe("the app's settings screen", () => {
  it("has the four switches right after Rooms, from the same copy", () => {
    expect(appSettings).toMatch(
      /import \{[^}]*PUSH_GROUPS[^}]*\} from "\.\.\/push-copy"/,
    );
    expect(appSettings).toContain("{PUSH_HEADING}");
    expect(appSettings).toContain("{PUSH_LINE}");
    expect(appSettings).toContain("PUSH_GROUPS.map(");
    expect(appSettings).toContain("<Title>{PUSH_HEADING}</Title>");
    expect(appSettings).toContain("<Muted>{PUSH_LINE}</Muted>");
    const rooms = appSettings.indexOf("<Title>Rooms</Title>");
    /* The section inline, or lifted into its own component and placed. */
    const placed = appSettings.indexOf("<PushPrefSwitches initial={prefs} />");
    const push =
      placed >= 0 ? placed : appSettings.indexOf("<Title>{PUSH_HEADING}</Title>");
    const blocked = appSettings.indexOf("<BlockedPlayers initial={blocked} />");
    expect(rooms).toBeGreaterThan(-1);
    expect(push).toBeGreaterThan(rooms);
    expect(blocked).toBeGreaterThan(push);
  });

  it("loads from the API, flips optimistically, and paints the truth back on error", () => {
    expect(appSettings).toMatch(/getPushPrefs\(\)/);
    expect(appSettings).toMatch(/setPushPref\(/);
    expect(appSettings).toMatch(
      /accessibilityLabel=\{`\$\{[a-zA-Z.]+\}, \$\{[^}]+\? "on" : "off"\}`\}/,
    );
    expect(appApi).toMatch(/"GET", "\/api\/v1\/me\/push"/);
    expect(appApi).toMatch(/"PUT", "\/api\/v1\/me\/push"/);
  });
});

describe("the app's registration and badge", () => {
  it("registers without prompting on every launch with a stored session", () => {
    expect(appPush).toMatch(
      /export async function registerForPush\(\s*\{ prompt \}: \{ prompt: boolean \} = \{ prompt: true \},?\s*\)/,
    );
    expect(appRoot).toContain("registerForPush({ prompt: false })");
  });

  it("sets the badge from the unread count and clears it on the Inbox", () => {
    expect(appRoot).toContain("shouldSetBadge: true");
    /* The Inbox hands the badge its unread count, then zero once read. */
    const sources = [appInbox, appPush, appRoot, appApi];
    expect(sources.some((source) => /setBadgeCountAsync\(/.test(source))).toBe(true);
    expect(appInbox).toMatch(/(?:setBadgeCountAsync|syncBadge)\(0\)/);
    expect(appInbox).toMatch(/(?:setBadgeCountAsync|syncBadge)\((?!0\))/);
  });

  it("routes every path a notice can carry", () => {
    expect(appRouter).toMatch(/startsWith\("\/e\/"\)/);
    expect(appRouter).toMatch(/"thread"/);
    expect(appRouter).toMatch(/navigate\("LocalThread", \{ threadId \}\)/);
    expect(appRouter).toMatch(/=== "\/local"/);
    expect(appRouter).toMatch(/"\/feed"/);
    expect(appRouter).toMatch(/"\/inbox"/);
    expect(appRouter).toMatch(/=== "\/profile"/);
    expect(appRouter).toMatch(/"\/p\/"/);
    expect(appRouter).toMatch(/navigate\("PlayerProfile", \{ playerId \}\)/);
    expect(appRouter).toMatch(/"\/s\/"/);
    expect(appRouter).toMatch(/navigate\("StoreProfile", \{ storeId \}\)/);
    expect(appRouter).toMatch(/=== "\/nights"/);
    expect(appRouter).toMatch(/screen: "Nights"/);
    /* The website fallback stays last. */
    const fallback = appRouter.lastIndexOf("Linking.openURL(");
    const lastRoute = appRouter.lastIndexOf("navigation.navigate(");
    expect(fallback).toBeGreaterThan(lastRoute);
  });
});

describe("the server", () => {
  it("every notice kind sits behind one of the four switches", () => {
    const kinds = [...notify.matchAll(/kind: "([a-z-]+)"/g)].map((match) => match[1]);
    expect(kinds.length).toBeGreaterThan(0);
    const keys = PUSH_GROUPS.map((group) => group.key);
    for (const kind of kinds) expect(keys, kind).toContain(groupForKind(kind));
    expect(groupForKind("offer-received")).toBe("offers");
    expect(groupForKind("message-received")).toBe("messages");
    expect(groupForKind("board-open")).toBe("nights");
    expect(groupForKind("new-follower")).toBe("social");
  });

  it("gates the push by the player's switch for the notice's group", () => {
    expect(notify).toMatch(/groupForKind\(/);
    expect(notify).toMatch(/pushPrefsFor\(/);
  });

  it("the push carries the badge and the channel", () => {
    expect(notify).toMatch(/unreadCount\(/);
    expect(notify).toMatch(/\bbadge[,:]/);
    expect(notify).toMatch(/channelId: "default"/);
  });

  it("the message notice's path carries the thread", () => {
    expect(notify).toMatch(/`\/local\?thread=\$\{[^}]*threadId[^}]*\}`/);
  });

  it("the app's two calls have a route", () => {
    expect(pushRoute).toMatch(/export async function GET/);
    expect(pushRoute).toMatch(/export async function PUT/);
    expect(pushRoute).toMatch(/apiPlayer\(/);
  });
});
