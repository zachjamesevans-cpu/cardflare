import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");
const flat = (text: string) => text.replace(/\s+/g, " ");

/**
 * Shareable binders and offers on their cards, the server half. The
 * founder: "Binders should be shareable... Any card in a trade binder
 * you should be able to do the same stack as making an offer on their
 * trade cards... Can then DM them about them."
 */

describe("the share link", () => {
  const page = flat(read("src/app/b/[binderId]/page.tsx"));
  const image = flat(read("src/app/b/[binderId]/opengraph-image.tsx"));

  it("finds the owner from the id and draws the same page as the long address", () => {
    expect(page).toContain(
      "const id = await binderIdFromLink((await params).binderId);",
    );
    expect(page).toContain("<PublicBinder playerId={owner} binderId={id} />");
    expect(flat(read("src/app/p/[playerId]/binders/[binderId]/page.tsx"))).toContain(
      "<PublicBinder playerId={playerId} binderId={binderId} />",
    );
  });

  it("previews only what a signed-out visitor could open", () => {
    expect(page).toContain("const binder = await readBinder(owner, null, id);");
    expect(image).toContain("await readBinder(owner, null, id)");
  });

  it("is claimed by the app on iOS, and nothing else is", () => {
    const aasa = flat(read("src/app/.well-known/apple-app-site-association/route.ts"));
    expect(aasa).toContain('const APP_ID = "J2N92N3SMA.gg.cardflare.app";');
    expect(aasa).toContain('paths: ["/b/*"]');
    const app = JSON.parse(read("mobile/app.json")) as {
      expo: { ios: { associatedDomains?: string[]; bundleIdentifier: string } };
    };
    /* www first: the apex 308s to it, and Apple reads the claim file
       only where it is served without a redirect. */
    expect(app.expo.ios.associatedDomains).toEqual([
      "applinks:www.cardflare.gg",
      "applinks:cardflare.gg",
    ]);
    expect(app.expo.ios.bundleIdentifier).toBe("gg.cardflare.app");
  });

  it("lets the app open any binder by id, still hiding a private one", () => {
    const route = flat(read("src/app/api/v1/binders/[binderId]/route.ts"));
    /* The id or the share link's short code, then the binder as this
       viewer may see it. */
    expect(route).toContain(
      "const id = await binderIdFromLink((await params).binderId);",
    );
    expect(route).toContain(
      "const owner = (await binderOwner(id)) ?? player.playerId;",
    );
    expect(route).toContain(
      "const binder = await readBinder(owner, player.playerId, id);",
    );
  });
});

describe("an offer on a trade binder", () => {
  const offers = flat(read("src/lib/binder/offers.ts"));

  it("refuses your own, a private one, and across a block", () => {
    expect(offers).toContain(
      'if (ownerId === viewerId) return { ok: false, reason: "yours" };',
    );
    expect(offers).toContain(
      'if (!binder || !binder.forTrade) return { ok: false, reason: "not-found" };',
    );
    expect(offers).toContain(
      'if (await blockedBetween(viewerId, ownerId)) return { ok: false, reason: "blocked" };',
    );
  });

  it("takes only the binder's own entries, at most what each holds", () => {
    expect(offers).toContain("const card = byEntry.get(item.entryId);");
    expect(offers).toMatch(
      /Math\.min\(\s*card\.quantity,\s*Math\.max\(1, Math\.round\(item\.quantity \|\| 1\)\)/,
    );
  });

  it("becomes one message in the pair's conversation, carrying the cards", () => {
    expect(offers).toContain("const threadId = await sendCardsMessage(");
    const threads = flat(read("src/lib/local/threads.ts"));
    expect(threads).toContain(
      "const conversation = await pairThreadId(recipientId, senderId);",
    );
    expect(threads).toContain("card_id: cardIds[0] ?? null, card_ids: cardIds,");
  });

  it("reads every card a message carries, falling back to the one", () => {
    const threads = flat(read("src/lib/local/threads.ts"));
    expect(threads).toContain("card: cards[0] ?? null, cards,");
    expect(threads).toContain(
      "message.card_ids && message.card_ids.length > 0 ? message.card_ids : message.card_id ? [message.card_id] : []",
    );
  });

  it("is open to the website and the app, both signed in", () => {
    expect(flat(read("src/lib/binder/actions.ts"))).toContain(
      'if (!player) return { ok: false, message: "Sign in to make an offer." };',
    );
    const route = flat(read("src/app/api/v1/binders/[binderId]/offer/route.ts"));
    expect(route).toContain("if (!player) return unauthorized();");
    expect(route).toContain("offerOnBinder(");
  });

  it("backfills the single-card messages as one-card lists", () => {
    const migration = flat(
      read("supabase/migrations/20261106090000_binder_offers.sql"),
    );
    expect(migration).toContain(
      "add column if not exists card_ids uuid[] not null default '{}'",
    );
    expect(migration).toContain("set card_ids = array[card_id]");
  });
});
