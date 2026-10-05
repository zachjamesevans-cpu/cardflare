import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  BINDER_OFFER_COPY,
  BINDER_OFFER_MAX_CARDS,
  BINDER_OFFER_NOTE_MAX,
  binderOfferBody,
} from "@/lib/binder/offer-copy";
import { MESSAGE_MAX_LENGTH } from "@/lib/local/shared";

const read = (path: string) => readFileSync(path, "utf8");
const flat = (text: string) => text.replace(/\s+/g, " ");

/** One top-level function's source, up to the next one. */
function fn(source: string, name: string): string {
  const start = source.indexOf(`function ${name}(`);
  expect(start, `function ${name}`).toBeGreaterThanOrEqual(0);
  const next = source.indexOf("\nfunction ", start + 1);
  return source.slice(start, next === -1 ? undefined : next);
}

/**
 * Shareable binders and offers on their cards, the website half. The
 * founder: "Binders should be shareable. Add a public link that can be
 * shared for binders so they can view it on web or app. Any card in a
 * trade binder you should be able to do the same stack as making an
 * offer on their trade cards... Can then DM them about them."
 */

const view = read("src/components/binder/binder-page.tsx");
const publicBinder = read("src/components/binder/public-binder.tsx");
const zoom = read("src/components/cards/card-image-zoom.tsx");
const review = read("src/components/flares/offer-review.tsx");
const postActions = read("src/components/feed/post-actions.tsx");
const local = read("src/components/local/local-screen.tsx");

describe("Share, at the top of the binder", () => {
  const share = fn(view, "ShareBinder");

  it("hands out the short link, cardflare.gg/b/<id>", () => {
    expect(share).toContain("const url = `${window.location.origin}/b/${binderId}`;");
    expect(share).toContain('<Share2 className="size-4" aria-hidden="true" />');
    expect(share).toContain('{copied ? "Link copied" : "Share"}');
  });

  it("uses the system share sheet, ignores a dismissal, and copies otherwise", () => {
    expect(share).toContain('typeof navigator.share === "function"');
    expect(share).toContain("await navigator.share({ title, url });");
    expect(share).toContain('error.name === "AbortError") return;');
    expect(share).toContain("await navigator.clipboard.writeText(url);");
    /* "Link copied" for two seconds, then the button again. */
    expect(share).toContain("setTimeout(() => setCopied(false), 2000)");
  });

  it("follows the live Up for trade switch, for the owner and for visitors", () => {
    expect(view).toContain("{(binder.yours || settings.forTrade) && (");
    expect(view).toContain("forTrade={settings.forTrade}");
    expect(view).toContain(
      "const shareTitle = `${binder.ownerName}'s ${settings.name}`;",
    );
  });

  it("says why on the owner's private binder, and shares nothing", () => {
    expect(view).toContain(
      'const PRIVATE_SHARE_LINE = "Turn on Up for trade to share this binder.";',
    );
    const refused = share.slice(share.indexOf("if (!forTrade) {"));
    expect(refused.indexOf("onPrivate();")).toBeLessThan(refused.indexOf("return;"));
    expect(refused.indexOf("return;")).toBeLessThan(refused.indexOf("navigator.share"));
    expect(view).toContain("{shareRefused && !settings.forTrade && (");
    expect(view).toContain("{PRIVATE_SHARE_LINE}");
  });
});

describe("an offer on a trade binder's cards: the Flare viewer's stack", () => {
  it("is offered only to a signed-in visitor who is not the owner and not blocked", () => {
    const decided = flat(publicBinder);
    expect(decided).toContain(
      'const offerAs = binder.yours ? null : other ? block.blocked || block.blockedBy ? null : "player" : viewer.kind === "anonymous" ? "guest" : null;',
    );
    expect(publicBinder).toContain("offerAs={offerAs}");
    /* The owner, and a binder that is not up for trade, see no offer. */
    expect(view).toContain(
      "const asking = !binder.yours && settings.forTrade && offerAs !== null;",
    );
    expect(view).toContain('const picking = asking && offerAs === "player";');
    expect(view).toContain("if (!asking) return null;");
  });

  it("asks somebody signed out to sign in, back to the share link", () => {
    expect(view).toContain("href: `/login?next=/b/${binder.id}`,");
    expect(view).toContain("label: BINDER_OFFER_COPY.signIn,");
    const block = fn(zoom, "ZoomAskBlock");
    expect(block).toContain('if (ask.mode === "sign-in") {');
    expect(block).toContain("<Link href={ask.href}");
  });

  it("draws the toggle and tray the way the Feed's viewer does", () => {
    expect(view).toContain("want: BINDER_OFFER_COPY.want,");
    expect(view).toContain("picked: BINDER_OFFER_COPY.picked,");
    expect(view).toContain("max: BINDER_OFFER_MAX_CARDS,");
    const ask = flat(fn(zoom, "ZoomAskBlock"));
    const have = flat(fn(zoom, "ZoomHaveBlock"));
    for (const shared of [
      'variant={added ? "secondary" : "primary"}',
      '{added && <Check className="size-4 text-accent" aria-hidden="true" />}',
      "{reviewLabel(count)}",
      '<span aria-hidden="true" className="block h-11" />',
    ]) {
      expect(have).toContain(shared);
      expect(ask).toContain(shared);
    }
    expect(ask).toContain("{added ? ask.picked : ask.want}");
    expect(zoom).toContain("{ask && <ZoomAskBlock ask={ask} offers={offers} />}");
    /* Every pocket's viewer carries the ask, across the whole binder. */
    expect(view).toContain("ask: askFor(card),");
    expect(view).toContain("ask={askFor(card)}");
  });

  it("keeps the picks on the binder and shows them under the pages", () => {
    expect(view).toContain("const build = useOfferBuild(null, offerable, sendOffer);");
    expect(view).toContain(
      "<OfferPicksContext.Provider value={offers}>{view}</OfferPicksContext.Provider>",
    );
    expect(view).toContain("<InYourOffer />");
    /* Keyed by the pocket, capped at the copies in it. */
    expect(view).toContain("flareId: card.entryId,");
    expect(view).toContain("max: Math.max(1, card.quantity),");
  });

  it("reviews in the Flare's sheet, in the binder's words, and sends a message", () => {
    const sheet = flat(view.slice(view.indexOf("<OfferReview")));
    expect(sheet).toContain("sendLabel={BINDER_OFFER_COPY.send}");
    expect(sheet).toContain("notePlaceholder={BINDER_OFFER_COPY.notePlaceholder}");
    expect(sheet).toContain("noteMax={BINDER_OFFER_NOTE_MAX}");
    expect(sheet).toContain("closeOnSent");
    const send = flat(view.slice(view.indexOf("const sendOffer: OfferSend")));
    expect(send).toContain("await offerOnBinderAction(binder.id, {");
    expect(send).toContain(
      "items: lines.map((line) => ({ entryId: line.key, quantity: line.quantity })),",
    );
    expect(send).toContain("note: message.trim() || null,");
    /* A refusal is the review's error line, as the Flare's. */
    expect(send).toContain(
      "if (!result.ok) return { ok: false, message: result.message, refused: [] };",
    );
  });

  it("says where the offer went, with the way into the chat", () => {
    expect(view).toContain(
      "const chat = sent ? `/local?thread=${encodeURIComponent(sent.threadId)}` : null;",
    );
    expect(view).toContain("{sent.message}");
    expect(view).toMatch(/href=\{chat\}[\s\S]*?Open the chat/);
    expect(fn(zoom, "ZoomAskBlock")).toMatch(
      /href=\{ask\.sent\.href\}[\s\S]*?Open the chat/,
    );
  });
});

describe("the Flare stack is unchanged", () => {
  it("still sends a Feed offer the way it did", () => {
    expect(postActions).toContain("const build = useOfferBuild(post.postId, cards);");
    expect(postActions).toMatch(
      /<OfferReview\s+open=\{build\.reviewOpen\}\s+onClose=\{build\.closeReview\}\s+lines=\{build\.lines\}\s+onQuantity=\{build\.setQuantity\}\s+onRemove=\{build\.remove\}\s+onSubmit=\{build\.submit\}\s+onSent=\{build\.clear\}\s+\/>/,
    );
    /* The hook's own send is used only when given one. */
    expect(zoom).toContain("if (send) return send(lines, message);");
    expect(zoom).toContain("const result = await offerItemsAction(");
  });

  it("defaults every new review prop to the Flare's words", () => {
    expect(review).toContain('sendLabel = "Send offer",');
    expect(review).toContain(
      'notePlaceholder = "Where to find you, or what you would take for them",',
    );
    expect(review).toContain("noteMax = MAX_OFFER_MESSAGE,");
    expect(review).toContain("closeOnSent = false,");
    expect(review).toContain('{pending ? "Sending…" : sendLabel}');
    /* Without closeOnSent, "Offer sent" and Done, as before. */
    expect(review).toContain('title={sent ? "Offer sent" : "Review your offer"}');
  });
});

describe("a message carrying many cards", () => {
  it("draws every card as a bubble, and the one card for older messages", () => {
    expect(local).toContain("<MessageCards message={message} />");
    const cards = fn(local, "MessageCards");
    expect(cards).toContain("message.cards && message.cards.length > 0");
    expect(cards).toContain("? [message.card]");
    expect(cards).toContain("flex-wrap");
    expect(cards).toContain('message.yours ? "justify-end" : "justify-start"');
    expect(cards).toContain("<CardBubble key=");
  });
});

describe("binderOfferBody", () => {
  it("names the binder and lists the cards", () => {
    expect(
      binderOfferBody(
        "Trades",
        [
          { name: "Luffy", quantity: 1 },
          { name: "Zoro", quantity: 1 },
        ],
        null,
      ),
    ).toBe("Offer on your Trades: Luffy, Zoro.");
  });

  it("says ×N for more than one copy", () => {
    expect(binderOfferBody("Trades", [{ name: "Nami", quantity: 2 }], null)).toBe(
      "Offer on your Trades: Nami ×2.",
    );
  });

  it("gives way to 'and N more' rather than run past a message's limit", () => {
    const cards = Array.from({ length: BINDER_OFFER_MAX_CARDS }, (_, index) => ({
      name: `Monkey D. Luffy Leader Parallel Alternate Art ${index + 1}`,
      quantity: 1,
    }));
    const body = binderOfferBody("Trades", cards, "x".repeat(BINDER_OFFER_NOTE_MAX));
    expect(body.length).toBeLessThanOrEqual(MESSAGE_MAX_LENGTH);
    expect(MESSAGE_MAX_LENGTH).toBe(500);
    expect(body).toMatch(/, and \d+ more\.\n\n/);
    expect(body.startsWith("Offer on your Trades: Monkey D. Luffy")).toBe(true);
  });

  it("puts the note on its own paragraph, trimmed", () => {
    expect(
      binderOfferBody("Trades", [{ name: "Ace", quantity: 1 }], "  at the store  "),
    ).toBe("Offer on your Trades: Ace.\n\nat the store");
    expect(binderOfferBody("Trades", [{ name: "Ace", quantity: 1 }], "   ")).toBe(
      "Offer on your Trades: Ace.",
    );
  });

  it("uses the binder's words for the viewer", () => {
    expect(BINDER_OFFER_COPY.want).toBe("I want this card");
    expect(BINDER_OFFER_COPY.picked).toBe("Added to your offer");
    expect(BINDER_OFFER_COPY.signIn).toBe("Sign in to make an offer");
    expect(BINDER_OFFER_COPY.send).toBe("Send offer");
  });
});
