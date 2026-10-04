import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(resolve(import.meta.dirname, "../..", path), "utf8");

/**
 * One conversation per person, drawn like Instagram's Messages, on both
 * platforms. The founder (2026-10-04), with a screenshot: "Conversation
 * should be person. Like this, showing their profile pic."
 *
 * Read off the source, because parity is about the same row, the same
 * header and the same card bubble on the website and in the app.
 */

const web = read("src/components/local/local-screen.tsx");
const app = {
  local: read("mobile/src/screens/local.tsx"),
  thread: read("mobile/src/screens/thread.tsx"),
  api: read("mobile/src/api.ts"),
};

/** One top-level function's source, from its declaration to the next. */
function fn(source: string, name: string): string {
  const start = source.indexOf(`function ${name}(`);
  expect(start, `function ${name}`).toBeGreaterThanOrEqual(0);
  const next = source.indexOf("\nfunction ", start + 1);
  return source.slice(start, next === -1 ? undefined : next);
}

describe("the Messages row is the person", () => {
  const rows = { web: fn(web, "ThreadRow"), app: fn(app.local, "ThreadRow") };

  it("shows their face through the shared PlayerAvatar, on both", () => {
    for (const [platform, row] of Object.entries(rows)) {
      expect(row, platform).toContain("<PlayerAvatar");
      expect(row, platform).toContain("avatarUrl={thread.withAvatarUrl}");
      expect(row, platform).toContain("displayName={thread.withName}");
      expect(row, platform).toContain("seed={thread.withPlayerId}");
    }
    /* About 56 on both: size-14 on the web, 56 points in the app. */
    expect(rows.web).toContain("size-14");
    expect(rows.app).toContain("size={56}");
  });

  it('says "You: " when the last message was the viewer\'s, then how long ago', () => {
    for (const [platform, row] of Object.entries(rows)) {
      expect(row, platform).toContain(
        'thread.lastFromYou ? "You: " + preview : preview',
      );
      expect(row, platform).toContain('" · "');
      expect(row, platform).toContain("agoLabel(thread.lastMessageAt)");
    }
  });

  it("bolds an unread row and marks it with a dot, never a number", () => {
    for (const [platform, row] of Object.entries(rows)) {
      expect(row, platform).toContain("thread.unread > 0");
      expect(row, platform).not.toContain("{thread.unread}");
    }
    expect(rows.web).toContain("font-bold");
    expect(rows.web).toMatch(/size-2\.5 shrink-0 rounded-full bg-accent/);
    expect(rows.app).toContain('fontWeight: unread ? "700"');
    expect(rows.app).toContain("backgroundColor: colors.accent");
    expect(rows.app).toContain("width: 10");
  });

  it("carries no card on the row: no thumb, no card name", () => {
    for (const [platform, row] of Object.entries(rows)) {
      expect(row, platform).not.toContain("thread.imageUrl");
      expect(row, platform).not.toContain("thread.cardName");
      expect(row, platform).not.toContain("<Thumb");
    }
  });

  it("is a plain row in the app, not a Card box", () => {
    expect(rows.app).not.toContain("<Card");
  });

  it("gives the app the two fields the row reads", () => {
    expect(app.api).toContain("withAvatarUrl: string | null;");
    expect(app.api).toContain("lastFromYou: boolean;");
  });
});

describe("the conversation's header is their face and opens their profile", () => {
  it("on the website", () => {
    const view = fn(web, "ThreadView");
    expect(view).toContain("setWithAvatarUrl(thread.withAvatarUrl ?? null)");
    expect(view).toContain("href={`/p/${withPlayerId}`}");
    const link = view.slice(view.indexOf("href={`/p/${withPlayerId}`}"));
    expect(link.indexOf("<PlayerAvatar")).toBeGreaterThan(-1);
    expect(link.indexOf("<PlayerAvatar")).toBeLessThan(link.indexOf("</Link>"));
    expect(link).toContain("avatarUrl={withAvatarUrl}");
  });

  it("in the app", () => {
    expect(app.thread).toContain("const face = thread.withAvatarUrl ?? null;");
    expect(app.thread).toContain("headerTitle: () => (");
    expect(app.thread).toContain(
      'navigation.navigate("PlayerProfile", { playerId: otherId })',
    );
    const header = fn(app.thread, "ThreadHeader");
    expect(header).toContain("<PlayerAvatar");
    expect(header).toContain("avatarUrl={avatarUrl}");
    expect(header).toContain("size={32}");
    expect(header).toContain("<Tap onPress={onOpen}");
    expect(app.api).toMatch(
      /withPlayerId\?: string \| null;\s*\/\*\*[^*]*\*\/\s*withAvatarUrl: string \| null;/,
    );
  });
});

describe("a message that carries a card draws the card above its words", () => {
  it("the app's message type carries the card", () => {
    const start = app.api.indexOf("export interface LocalThreadMessage {");
    const type = app.api
      .slice(start, app.api.indexOf("\n}\n", start))
      .replace(/\s+/g, " ");
    expect(type).toContain(
      "card: { cardId: string; name: string; number: string; imageUrl: string | null; } | null;",
    );
  });

  it("on the website: the bubble opens the card page", () => {
    expect(web).toContain("{message.card && <CardBubble card={message.card} />}");
    const bubble = fn(web, "CardBubble");
    expect(bubble).toContain("href={`/cards/${card.cardId}`}");
    expect(bubble).toContain("<Thumb imageUrl={card.imageUrl} />");
    expect(bubble).toContain("{card.name}");
    expect(bubble).toContain("{card.number}");
    /* About 44 wide, the card's own proportions. */
    expect(fn(web, "Thumb")).toContain("w-11");
    expect(fn(web, "Thumb")).toContain("aspect-[60/84]");
  });

  it("in the app: the bubble opens the Card screen", () => {
    expect(app.thread).toContain("{item.card ? (");
    expect(app.thread).toContain('navigation.navigate("Card", { cardId })');
    const bubble = fn(app.thread, "CardBubble");
    expect(bubble).toContain("onOpen(card.cardId)");
    expect(bubble).toContain("width: 44");
    expect(bubble).toContain("aspectRatio: 60 / 84");
    expect(bubble).toContain("{card.name}");
    expect(bubble).toContain("{card.number}");
  });

  it("sits on the sender's side, on both", () => {
    expect(web).toContain(
      'message.yours ? "items-end self-end" : "items-start self-start"',
    );
    expect(app.thread).toContain('alignItems: item.yours ? "flex-end" : "flex-start"');
  });
});
