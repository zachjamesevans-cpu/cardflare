import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The words a Flare's direction wears, and the chrome around the Feed.
 *
 * Decided in one round and pinned here so a later edit cannot bring
 * one of the old words back on one platform: a card is "Looking for"
 * or "Offering", never hunted or let go of; the crosshair is the Flare
 * status mark and nothing else's; Follow is one button whoever is
 * being followed; and a tab-bar page's logo goes to the Feed.
 */

const ROOT = resolve(import.meta.dirname, "../..");
const read = (path: string) => readFileSync(resolve(ROOT, path), "utf8");

describe("which way a Flare points", () => {
  it("says Looking for and Offering on the post", () => {
    const card = read("src/components/feed/flare-feed-card.tsx");
    expect(card).toContain('"is looking for"');
    expect(card).toContain('"is offering"');
    expect(card).toContain('"Offering" : "Looking for"');
    expect(card).not.toMatch(/hunting/i);
    expect(card).not.toContain('"Want"');
  });

  it("says the same on the older row", () => {
    const items = read("src/components/feed/feed-items.tsx");
    expect(items).toContain('"Offering" : "Looking for"');
    expect(items).not.toContain("Letting go");
    expect(items).not.toMatch(/\bhunting\b/i);
  });

  it("keeps the crosshair for the Flare status mark alone", () => {
    expect(read("src/components/feed/flare-feed-card.tsx")).toContain("<Crosshair");
    expect(read("src/components/players/hunts-panel.tsx")).not.toContain("Crosshair");
    expect(read("src/components/players/hunts-panel.tsx")).toContain("<ListChecks");
  });

  it("says offer, never pledge, to a person", () => {
    /* The tile's handshake button is gone (see board-tile-offer.test.ts);
       the offer now lives in the zoom, and the words a person reads
       there say offer. */
    const zoom = read("src/components/cards/card-image-zoom.tsx");
    expect(zoom).toContain("You offered.");
    /* `pledges` stays as a prop name; no label or sentence says it. */
    expect(zoom).not.toMatch(/\bPledge\b|your pledge|pledge back|"pledge/);
    expect(read("src/app/p/[playerId]/page.tsx")).not.toContain("pledge");
  });
});

describe("the Feed page", () => {
  const page = read("src/app/feed/page.tsx");
  const items = read("src/components/feed/feed-items.tsx");

  it("has one empty state per tab and no unreachable fourth", () => {
    expect(page.match(/shown\.length === 0/g)).toHaveLength(3);
    expect(page).not.toContain("No Flares of yours yet");
  });

  it("draws no reason line under a post, a store's included", () => {
    expect(page).toContain('item.kind !== "hunt" && item.kind !== "storePost"');
  });

  it("defines agoFrom once, on the post, and the row borrows it", () => {
    expect(items).not.toContain("function agoFrom");
    expect(items).toContain(
      'import { agoFrom, FlareFeedCard } from "@/components/feed/flare-feed-card"',
    );
    expect(read("src/components/feed/flare-feed-card.tsx")).toContain(
      "export function agoFrom(",
    );
  });

  it("keeps the nearby I-have-this row behind Local's switch", () => {
    const block = items.slice(items.indexOf('item.kind === "nearbyMatch"'));
    expect(block.slice(0, block.indexOf("<MatchRow"))).toContain(
      "if (!LOCAL_ENABLED) return null;",
    );
    expect(items).toContain('import { LOCAL_ENABLED } from "@/lib/local/enabled"');
  });

  it("offers a guest the account first, and a way in second", () => {
    expect(page).toContain("Create free account");
    expect(page).toMatch(/>\s*Sign in\s*</);
    expect(page).not.toContain("Join free");
    expect(read("src/components/players/account-pitch.tsx")).toContain(
      "Create free account",
    );
  });
});

describe("the chrome of a tab-bar page", () => {
  it("is one shell for the Feed and a player's page, with the logo on the Feed", () => {
    const shell = read("src/components/players/tab-page-shell.tsx");
    expect(shell).toContain('<Link href="/feed"');
    expect(shell).toContain("<PlayerTabBar />");
    expect(shell).toContain("<TabBarSpacer />");

    for (const path of ["src/app/feed/page.tsx", "src/app/p/[playerId]/page.tsx"]) {
      expect(read(path)).toContain("<TabPageShell");
      expect(read(path)).not.toContain("AppShell");
    }
    /* The name is ProfileHeader's alone: no console title above it. */
    const profile = read("src/app/p/[playerId]/page.tsx");
    expect(profile).not.toContain("What this player has traded for");
    expect(profile).toContain("description: `${profile.displayName} on cardflare`");
  });

  it("sends a hunt page's logo to the Feed too", () => {
    expect(read("src/app/hunts/[huntId]/page.tsx")).toContain('<Link href="/feed"');
  });

  it("takes Back on the tournaments page to the room it came from", () => {
    const page = read("src/app/tournaments/page.tsx");
    expect(page).toContain("function backHref(");
    expect(page).toContain('"/feed"');
  });
});

describe("Follow, one look for players and stores", () => {
  it("shares one class between the two buttons", () => {
    const shared = 'from "@/components/players/follow-styles"';
    expect(read("src/components/players/follow-button.tsx")).toContain(shared);
    expect(read("src/components/stores/follow-store-button.tsx")).toContain(shared);
    expect(read("src/components/stores/follow-store-button.tsx")).not.toContain(
      "buttonStyles(",
    );
  });

  it("gives a guest a Follow that starts sign-up and comes back, on both pages", () => {
    const player = read("src/app/p/[playerId]/page.tsx");
    const store = read("src/app/s/[storeId]/page.tsx");
    expect(player).toContain(
      "href={`/signup?next=${encodeURIComponent(`/p/${playerId}`)}`}",
    );
    expect(store).toContain(
      "href={`/signup?next=${encodeURIComponent(`/s/${store.storeId}`)}`}",
    );
    for (const source of [player, store]) {
      expect(source).not.toContain("Sign in to follow");
      expect(source).not.toMatch(/your locals/i);
    }
  });
});
