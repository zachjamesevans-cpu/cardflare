import { describe, expect, it } from "vitest";

import {
  BODY_MAX,
  checkAnnouncement,
  HEADLINE_MAX,
  MAX_DAYS,
} from "@/lib/announcements/schema";

/**
 * The one place in the product where somebody types words that every
 * player will read.
 *
 * Which makes the link rule a security rule rather than a tidiness one:
 * an off-origin href here is a phishing link aimed at the whole pilot at
 * once, wearing our mark and sitting at the top of the screen people
 * open by habit. It is refused in three places — here, in the Server
 * Action that calls this, and in a check constraint — and this is the
 * layer that turns the refusal into a sentence somebody can act on.
 */

const GOOD = {
  headline: "OP-17 lands Friday",
  body: "Paste your list now and every card in it is ready to post.",
  linkLabel: "Paste a deck list",
  linkHref: "/profile/settings",
  days: "7",
};

const NOW = Date.parse("2026-08-17T12:00:00Z");

describe("checkAnnouncement", () => {
  it("takes a notice with a button", () => {
    const checked = checkAnnouncement(GOOD, NOW);

    expect(checked).toEqual({
      ok: true,
      draft: {
        headline: GOOD.headline,
        body: GOOD.body,
        linkLabel: GOOD.linkLabel,
        linkHref: GOOD.linkHref,
        expiresAt: new Date(NOW + 7 * 24 * 60 * 60 * 1000).toISOString(),
      },
    });
  });

  it("takes a notice with no button at all", () => {
    const checked = checkAnnouncement({ ...GOOD, linkLabel: "", linkHref: "" }, NOW);

    expect(checked.ok).toBe(true);
    if (!checked.ok) return;
    expect(checked.draft.linkLabel).toBeNull();
    expect(checked.draft.linkHref).toBeNull();
  });

  it.each([
    ["https://evil.example", "an absolute URL"],
    ["//evil.example", "a protocol-relative URL"],
    ["javascript:alert(1)", "a javascript: URL"],
    ["profile/settings", "a path with no leading slash"],
  ])("refuses %j — %s", (linkHref) => {
    const checked = checkAnnouncement({ ...GOOD, linkHref }, NOW);

    expect(checked.ok).toBe(false);
    if (checked.ok) return;
    expect(checked.message).toContain("path on CardFlare");
  });

  it.each([
    [{ linkLabel: "", linkHref: "/feed" }, "a button with no label is invisible"],
    [{ linkLabel: "Go", linkHref: "" }, "a label with nowhere to go is a lie"],
  ])("refuses half a link (%#) — %s", (half) => {
    const checked = checkAnnouncement({ ...GOOD, ...half }, NOW);
    expect(checked.ok).toBe(false);
  });

  it("insists on a headline and a body", () => {
    expect(checkAnnouncement({ ...GOOD, headline: "   " }, NOW).ok).toBe(false);
    expect(checkAnnouncement({ ...GOOD, body: "   " }, NOW).ok).toBe(false);
  });

  it("holds the lengths the table's own constraints hold", () => {
    expect(
      checkAnnouncement({ ...GOOD, headline: "x".repeat(HEADLINE_MAX) }, NOW).ok,
    ).toBe(true);
    expect(
      checkAnnouncement({ ...GOOD, headline: "x".repeat(HEADLINE_MAX + 1) }, NOW).ok,
    ).toBe(false);
    expect(checkAnnouncement({ ...GOOD, body: "x".repeat(BODY_MAX + 1) }, NOW).ok).toBe(
      false,
    );
  });

  it.each(["", "0", "-3", "not a number", String(MAX_DAYS + 1)])(
    "refuses %j days, because a notice with no end is how a feed rots",
    (days) => {
      expect(checkAnnouncement({ ...GOOD, days }, NOW).ok).toBe(false);
    },
  );

  it("always ends in the future", () => {
    const checked = checkAnnouncement({ ...GOOD, days: "1" }, NOW);
    expect(checked.ok).toBe(true);
    if (!checked.ok) return;
    expect(Date.parse(checked.draft.expiresAt)).toBeGreaterThan(NOW);
  });

  it("trims what was typed, so a stray space is not a headline", () => {
    const checked = checkAnnouncement({ ...GOOD, headline: "  OP-17  " }, NOW);
    expect(checked.ok).toBe(true);
    if (!checked.ok) return;
    expect(checked.draft.headline).toBe("OP-17");
  });
});
