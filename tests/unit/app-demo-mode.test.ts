import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { demoAnswer, demoSaw } from "../../mobile/src/demo/demo-server";

/**
 * Demo mode: the app answering itself for screenshots. The founder
 * (2026-10-11): "surely there is an 'inspect element' way of doing this
 * so that the changes don't actually hit a server", then "use made up
 * people. make sure they have profile pictures though. app needs to
 * look activated on all fronts."
 *
 * Two promises are pinned here: nothing written in demo mode leaves the
 * phone, and demo mode cannot exist outside a development build.
 */

const ROOT = resolve(import.meta.dirname, "../..");
const read = (path: string) => readFileSync(resolve(ROOT, path), "utf8");

type Feed = {
  items: {
    kind: string;
    postId?: string;
    liked?: boolean;
    likes?: number;
    avatarUrl?: string | null;
    hunt?: { name: string } | null;
    cards?: { cardName: string; match: string | null }[];
    tab?: string;
    yours?: boolean;
  }[];
};
const feed = () => (demoAnswer("GET", "/api/v1/feed", undefined)?.value as Feed).items;

describe("demo mode never writes to the server", () => {
  it("answers every write itself, scripted or not", () => {
    const writes: [string, string, unknown][] = [
      ["POST", "/api/v1/flares/publish", { intent: "want", items: [] }],
      ["POST", "/api/v1/posts/demo-post-maya-crew", { action: "like" }],
      ["POST", "/api/v1/posts/some-real-post", { action: "comment", body: "hi" }],
      ["POST", "/api/v1/local/threads/demo-t-maya", { body: "hello" }],
      [
        "PATCH",
        "/api/v1/local/threads/demo-t-leo/trade",
        { tradeId: "x", answer: "yes" },
      ],
      ["POST", "/api/v1/profile", { action: "rename", displayName: "x" }],
      ["POST", "/api/v1/binders", { name: "x" }],
      ["PATCH", "/api/v1/binders/b1/cards", {}],
      ["DELETE", "/api/v1/wants/w1", {}],
      ["PUT", "/api/v1/me/location", { postalCode: "10001" }],
      ["POST", "/api/v1/devices", { pushToken: "t" }],
      ["POST", "/api/v1/billing/apple", {}],
      ["POST", "/api/v1/me/delete", {}],
      ["POST", "/api/players/real-player", { action: "follow" }],
    ];
    for (const [method, path, body] of writes) {
      expect(demoAnswer(method, path, body), `${method} ${path}`).not.toBeNull();
    }
  });

  it("lets an unscripted read go to the real server, where it changes nothing", () => {
    expect(demoAnswer("GET", "/api/v1/me", undefined)).toBeNull();
    expect(demoAnswer("GET", "/api/v1/binders", undefined)).toBeNull();
    expect(demoAnswer("GET", "/api/v1/cards?q=luffy", undefined)).toBeNull();
    expect(demoAnswer("GET", "/api/v1/posts/a-real-post", undefined)).toBeNull();
  });

  it("puts the check before the network, in the one function every call goes through", () => {
    const api = read("mobile/src/api.ts");
    const call = api.slice(api.indexOf("async function call<T>("));
    expect(call.indexOf("demoAnswer(method, path, body)")).toBeGreaterThan(-1);
    expect(call.indexOf("demoAnswer(method, path, body)")).toBeLessThan(
      call.indexOf("await fetch("),
    );
  });
});

describe("demo mode exists in development builds only", () => {
  it("is off whatever is stored unless __DEV__", () => {
    const mode = read("mobile/src/demo/demo-mode.ts");
    expect(mode).toContain('const DEV = typeof __DEV__ !== "undefined" && __DEV__;');
    expect(mode).toContain("return DEV && on;");
    expect(mode).toMatch(
      /export async function setDemoMode[\s\S]*?if \(!DEV\) return;/,
    );
  });

  it("has no route or switch in a release build", () => {
    const app = read("mobile/App.tsx");
    expect(app).toMatch(/\{__DEV__ \? \(\s*<Stack\.Screen\s*name="DemoShots"/);
    const settings = read("mobile/src/screens/settings.tsx");
    expect(settings).toMatch(/\{__DEV__ && \(\s*<Card>\s*<Title>Demo mode<\/Title>/);
  });
});

describe("demo mode looks activated", () => {
  it("fills the Feed and Nearby with made-up people who have pictures", () => {
    const items = feed();
    const posts = items.filter((item) => item.kind === "hunt" && !item.yours);
    expect(posts.length).toBeGreaterThanOrEqual(10);
    expect(posts.filter((p) => p.tab === "following").length).toBeGreaterThanOrEqual(5);
    expect(posts.filter((p) => p.tab === "nearby").length).toBeGreaterThanOrEqual(3);
    expect(items.some((item) => item.kind === "nearbyMatch")).toBe(true);
    for (const post of posts) {
      expect(post.avatarUrl).toMatch(/^https:\/\/api\.dicebear\.com\/9\.x\//);
    }
    expect(posts.some((p) => p.hunt)).toBe(true);
    expect(posts.some((p) => p.cards?.some((c) => c.match === "exact"))).toBe(true);
  });

  it("has a trade waiting in Messages and unread notices", () => {
    const thread = demoAnswer("GET", "/api/v1/local/threads/demo-t-maya", undefined)
      ?.value as { trade: { status: string; awaitingYou: boolean } };
    expect(thread.trade).toMatchObject({ status: "pending", awaitingYou: true });
    const unread = demoAnswer("GET", "/api/v1/notifications/unread", undefined)
      ?.value as {
      unread: number;
    };
    expect(unread.unread).toBeGreaterThan(0);
    const people = demoAnswer("GET", "/api/v1/followers", undefined)?.value as {
      followers: { avatarUrl: string }[];
    };
    expect(people.followers.length).toBeGreaterThanOrEqual(50);
  });

  it("lands a like, a message and a new post the way the real thing would", () => {
    const before = feed().find((p) => p.postId === "demo-post-leo-law");
    demoAnswer("POST", "/api/v1/posts/demo-post-leo-law", { action: "like" });
    const after = feed().find((p) => p.postId === "demo-post-leo-law");
    expect(after?.liked).toBe(true);
    expect(after?.likes).toBe((before?.likes ?? 0) + 1);

    demoAnswer("POST", "/api/v1/local/threads/demo-t-priya", {
      body: "See you Friday",
    });
    const thread = demoAnswer("GET", "/api/v1/local/threads/demo-t-priya", undefined)
      ?.value as { messages: { body: string; yours: boolean }[] };
    expect(thread.messages.at(-1)).toMatchObject({
      body: "See you Friday",
      yours: true,
    });

    /* The composer's card came from the real catalogue; the post that
       goes up names it and lands on top, in the hunt you chose. */
    demoSaw("GET", "/api/v1/cards?q=nami", {
      cards: [
        {
          id: "card-nami",
          name: "Nami",
          cardNumber: "OP01-016",
          basePrintingId: "pr-1",
          printings: [
            { id: "pr-1", label: "OP-01 · R", imageUrl: "https://x/nami.jpg" },
          ],
        },
      ],
    });
    demoSaw("GET", "/api/v1/hunts", {
      hunts: [{ id: "hunt-real", name: "Navigators" }],
    });
    demoAnswer("POST", "/api/v1/flares/publish", {
      intent: "want",
      items: [{ cardId: "card-nami", printingId: "pr-1", quantity: 1 }],
      hunt: { id: "hunt-real" },
    });
    const top = feed()[0];
    expect(top).toMatchObject({ yours: true, hunt: { name: "Navigators" } });
    expect(top.cards?.[0].cardName).toBe("Nami");
  });
});
