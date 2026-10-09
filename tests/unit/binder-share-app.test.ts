import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import * as app from "../../mobile/src/binder-offer-copy";
import * as site from "@/lib/binder/offer-copy";

const read = (path: string) => readFileSync(path, "utf8");
const flat = (text: string) => text.replace(/\s+/g, " ");

/**
 * Shareable binders and offers on their cards, the app half. The
 * founder: "Binders should be shareable. Add a public link that can be
 * shared for binders so they can view it on web or app. Any card in a
 * trade binder you should be able to do the same stack as making an
 * offer on their trade cards... Can then DM them about them." And the
 * standing rule: the app says what the website says.
 */

describe("the words", () => {
  it("are the website's, word for word", () => {
    expect(app.BINDER_OFFER_COPY).toEqual(site.BINDER_OFFER_COPY);
    expect(app.BINDER_OFFER_MAX_CARDS).toBe(site.BINDER_OFFER_MAX_CARDS);
    expect(app.BINDER_OFFER_NOTE_MAX).toBe(site.BINDER_OFFER_NOTE_MAX);
    for (const name of ["Mia", "Kaito", "O'Brien"]) {
      expect(app.binderOfferSentLine(name)).toBe(site.binderOfferSentLine(name));
    }
    expect(app.binderOfferSentLine("Mia")).toBe("Sent to Mia. It's in your messages.");
  });

  it("refuse in the sentences the website's action says", () => {
    const action = flat(read("src/lib/binder/actions.ts"));
    const cases: [string, string][] = [
      ["unauthorized", "Sign in to make an offer."],
      ["invalid", "Pick a card first."],
      ["yours", "That's your own binder."],
      ["blocked", "You can't message this player."],
      ["not-found", "This binder isn't up for trade any more."],
      ["empty", "Those cards aren't in the binder any more."],
      ["unavailable", "Could not send that. Try again in a moment."],
    ];
    for (const [reason, sentence] of cases) {
      expect(app.binderOfferFailure(reason)).toBe(sentence);
      expect(action).toContain(`"${sentence}"`);
    }
  });
});

describe("the share link", () => {
  const binder = flat(read("mobile/src/screens/binder.tsx"));
  const config = flat(read("mobile/src/config.ts"));

  it("is www.cardflare.gg/b/<id>, the host that serves the claim unredirected", () => {
    expect(config).toContain('export const SITE_URL = "https://www.cardflare.gg";');
    /* The short code since binder round 3, the id while it has none. */
    expect(config).toContain("`${SITE_URL}/b/${encodeURIComponent(code)}`");
    expect(binder).toContain(
      "const url = binderShareUrl(binder.shareCode ?? binder.id);",
    );
  });

  it("goes to the share sheet, and a private binder is told how to get one", () => {
    expect(binder).toContain("Share.share({ message: url, url })");
    expect(binder).toContain('name="share-outline"');
    expect(binder).toContain("if (!binder.forTrade) {");
    expect(binder).toContain(
      'Alert.alert("Turn on Up for trade to share this binder.");',
    );
  });
});

describe("the link opens the app", () => {
  const root = flat(read("mobile/App.tsx"));

  it("routes b/:binderId to the Binder screen, over the tabs", () => {
    expect(root).toContain('Binder: "b/:binderId"');
    expect(root).toContain('initialRouteName: "Tabs"');
    expect(root).toContain('"https://cardflare.gg"');
    expect(root).toContain('"cardflare://"');
    expect(root).toContain("linking={linking}");
  });

  it("asks the server whose binder it is, not the route", () => {
    const binder = flat(read("mobile/src/screens/binder.tsx"));
    expect(binder).toContain("const yours = binder?.yours ?? false;");
    expect(binder).toContain(
      /* A binder brought to a night takes offers there too (night-binders.ts). */
      "const offering = Boolean(binder && !binder.yours && (binder.forTrade || nightId));",
    );
    expect(binder).not.toMatch(/yours\s*=\s*!playerId/);
    /* With no playerId, getBinder asks /api/v1/binders/<id>, which now
       answers any binder by id. */
    const api = flat(read("mobile/src/api.ts"));
    expect(api).toContain(": `/api/v1/binders/${encodeURIComponent(binderId)}`;");
  });
});

describe("the offer stack on somebody's trade binder", () => {
  const api = flat(read("mobile/src/api.ts"));
  const ui = flat(read("mobile/src/ui.tsx"));
  const binder = flat(read("mobile/src/screens/binder.tsx"));
  const sheet = flat(read("mobile/src/offer-review-sheet.tsx"));

  it("posts to the binder's offer route", () => {
    expect(api).toContain("export const offerOnBinder = (");
    expect(api).toContain(
      '"POST", `/api/v1/binders/${encodeURIComponent(binderId)}/offer${',
    );
    expect(api).toContain('nightId ? `?night=${encodeURIComponent(nightId)}` : ""');
    expect(binder).toContain(
      "items.map((item) => ({ entryId: item.flareId, quantity: item.quantity }))",
    );
  });

  it("is the Flare viewer's, with the verb turned to want", () => {
    expect(ui).toContain('verb?: "have" | "want";');
    expect(ui).toContain("BINDER_OFFER_COPY.picked");
    expect(ui).toContain("BINDER_OFFER_COPY.want");
    /* Every Flare still says what it said. */
    expect(ui).toContain('? "Added to your offer" : "I have this card"');
    expect(binder).toContain('verb: "want",');
    expect(binder).toContain("onSent: afterSend,");
  });

  it("reviews with the binder's words, and a Flare's review is untouched", () => {
    expect(sheet).toContain('sendLabel = "Send offer",');
    expect(sheet).toContain(
      'notePlaceholder = "A note, like where you will be (optional)",',
    );
    expect(sheet).toContain("failure = offerErrorMessage,");
    expect(ui).toContain(
      'sendLabel={door.verb === "want" ? BINDER_OFFER_COPY.send : undefined}',
    );
    expect(binder).toContain("sendLabel={BINDER_OFFER_COPY.send}");
    expect(binder).toContain("notePlaceholder={BINDER_OFFER_COPY.notePlaceholder}");
  });

  it("keeps the picks in sight under the pockets", () => {
    expect(binder).toContain("{inYourOfferLine(inOffer)}");
    expect(binder).toContain("offering && inOffer > 0");
  });

  it("says where it went, with the way to the conversation", () => {
    expect(binder).toContain(
      "Alert.alert(binderOfferSentLine(ownerName), undefined, [",
    );
    expect(binder).toContain('text: "Open chat",');
    expect(binder).toContain('navigation.navigate("LocalThread", { threadId })');
    expect(binder).toContain('{ text: "OK", style: "cancel" as const }');
  });
});

describe("the thread", () => {
  it("draws every card a message carries", () => {
    const thread = flat(read("mobile/src/screens/thread.tsx"));
    expect(thread).toContain("item.cards && item.cards.length > 0");
    expect(thread).toContain("? [item.card]");
    expect(thread).toContain("<CardBubble key=");
    expect(flat(read("mobile/src/api.ts"))).toContain("cards?: {");
  });
});
