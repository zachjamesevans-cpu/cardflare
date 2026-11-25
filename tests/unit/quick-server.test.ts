import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { withCardFirst, type DraftCard } from "@/components/flares/draft";
import { flareTarget } from "@/components/flares/flare-button";
import type { CardResult } from "@/lib/cards/schema";

const read = (path: string) => readFileSync(path, "utf8");

/**
 * The faces on pushes, the card a Flare is opened on, and the Inbox
 * dot: the server, the website and the iOS extension's wiring.
 */

describe("a push wears the face of whoever did it", () => {
  const notify = read("src/lib/notifications/notify.ts");

  it("looks up the actor's name and still picture as an absolute link", () => {
    expect(notify).toContain("export async function pushActor(");
    expect(notify).toContain('.select("display_name, avatar_url")');
    expect(notify).toContain("avatar: `${siteUrl()}${path}`");
    expect(notify).not.toMatch(/pushActor[\s\S]{0,400}avatar_animated/);
  });

  it("marks the push mutable and carries the two fields only when there is a face", () => {
    expect(notify).toContain("...(actor ? { mutableContent: true } : {}),");
    expect(notify).toContain(
      "? { url: path, actorName: actor.name, actorAvatar: actor.avatar }",
    );
  });

  it("names the actor at every push a person caused", () => {
    for (const call of [
      '"offer-received", actorId);',
      '"new-follower", followerId);',
      '"room-flare", actorId);',
      '"message-received", senderId);',
      '"post-comment", commenterId);',
      '"nearby-match", match.wanterId);',
      '"night-match", entry.goerId);',
      '"trade-confirmed", actorId);',
    ]) {
      expect(notify.replace(/\s+/g, " ").replace(/, \)/g, ")"), call).toContain(call);
    }
  });
});

describe("the iOS notification service extension", () => {
  const swift = read("mobile/targets/notification-service/NotificationService.swift");
  const app = JSON.parse(read("mobile/app.json")) as {
    expo: {
      plugins: unknown[];
      ios: {
        appleTeamId?: string;
        entitlements?: Record<string, unknown>;
        infoPlist: Record<string, unknown>;
      };
    };
  };

  it("is a notification-service target generated at prebuild", () => {
    const config = read("mobile/targets/notification-service/expo-target.config.js");
    expect(config).toContain('type: "notification-service"');
    expect(config).toContain('bundleIdentifier: ".NotificationService"');
    expect(config).toContain('frameworks: ["Intents"]');
    expect(app.expo.plugins).toContain("@bacons/apple-targets");
    expect(app.expo.ios.appleTeamId).toBe("J2N92N3SMA");
  });

  it("gives the app the communication entitlement and the message intent", () => {
    expect(
      app.expo.ios.entitlements?.[
        "com.apple.developer.usernotifications.communication"
      ],
    ).toBe(true);
    expect(app.expo.ios.infoPlist.NSUserActivityTypes).toEqual(["INSendMessageIntent"]);
  });

  it("builds a message from a person, and falls back to the plain push on any failure", () => {
    expect(swift).toContain('data["actorName"]');
    expect(swift).toContain('data["actorAvatar"]');
    expect(swift).toContain('url.scheme == "https"');
    expect(swift).toContain("INSendMessageIntent(");
    expect(swift).toContain("try? content.updating(from: intent)");
    expect(swift).toContain("?? content");
    expect(swift).toContain("override func serviceExtensionTimeWillExpire()");
    expect(swift).toContain("config.timeoutIntervalForResource = 10");
  });
});

describe("the Flare button carries the card (website)", () => {
  const card = (id: string): CardResult =>
    ({
      id,
      exactName: id,
      canonicalCardNumber: id,
      printings: [],
    }) as unknown as CardResult;
  const line = (id: string, quantity = 1): DraftCard => ({
    card: card(id),
    printingId: null,
    quantity,
  });

  it("puts a new card first and keeps the rest", () => {
    expect(
      withCardFirst([line("a"), line("b")], card("c")).map((l) => l.card.id),
    ).toEqual(["c", "a", "b"]);
  });

  it("moves a card already on the draft to the front, copies kept, never twice", () => {
    const out = withCardFirst([line("a"), line("b", 3)], card("b"));
    expect(out.map((l) => l.card.id)).toEqual(["b", "a"]);
    expect(out[0]?.quantity).toBe(3);
  });

  it("is wired from the Flare button on a card through /flare?card=", () => {
    /* A card's page and the card modal both post the card from the Flare
       button (flare-button.tsx), not a "Post a Flare for it" link. */
    const id = "0b5e6a2c-1f3d-4c7e-9a8b-2d4f6e8a0c1e";
    expect(flareTarget(`/cards/${id}`)).toEqual({
      href: `/flare?card=${id}`,
      label: "Flare this card",
    });
    expect(flareTarget("/feed")).toEqual({ href: "/flare", label: "Post a Flare" });
    expect(read("src/components/cards/card-modal.tsx")).toContain(
      "href={`/flare?card=${cardId}`}",
    );
    const page = read("src/app/flare/page.tsx");
    expect(page).toContain("cardResultById(card)");
    expect(page).toContain("initialCard={initialCard}");
    expect(read("src/components/flares/flare-composer.tsx")).toContain(
      "withCardFirst(loaded.cards, initialCard)",
    );
  });
});

describe("the Inbox dot", () => {
  it("answers the app with a head count", () => {
    const route = read("src/app/api/v1/notifications/unread/route.ts");
    expect(route).toContain(
      "Response.json({ unread: await unreadCount(player.playerId) })",
    );
    expect(route).toContain("if (!player) return unauthorized();");
  });

  it("is a count on the website's tab bar, Instagram's way", () => {
    const tabs = read("src/components/players/player-tabs.tsx");
    expect(tabs).toContain("rounded-full bg-accent px-1");
    expect(tabs).toContain('unread > 9 ? "9+" : unread');
  });
});
