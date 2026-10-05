import { describe, expect, it } from "vitest";

import type { EmailMessage } from "@/lib/email/client";
import {
  giftEndedEmail,
  giftGrantedEmail,
  giftReminderEmail,
  type GiftFacts,
} from "@/lib/email/store-gift";
import { playerInviteEmail, storeInviteEmail } from "@/lib/email/store-invite";

/**
 * The Ultra gift's emails, and the store invitation that carries one.
 *
 * The founder asked for "a super good email that is poppy and cool and
 * exciting that they are part of the cardflare beta", so these pin the
 * parts that make it so (the gift in huge type, both parts of the
 * message saying it) and the parts that keep it honest (the price, the
 * right links, a name that cannot inject markup).
 */

const ORIGIN = "https://cardflare.gg";
const LINK =
  "https://cardflare.gg/auth/confirm?token_hash=abc&type=recovery&next=%2Fwelcome";
const STORE_ID = "8b0c3f1e-0000-4000-8000-000000000001";

const timed = (days: number): GiftFacts => ({
  kind: "timed",
  days,
  untilLabel: "Dec 4, 2026",
  price: "$35",
});
const founding: GiftFacts = {
  kind: "founding",
  days: null,
  untilLabel: null,
  price: "$35",
};

const invite = (
  gift: GiftFacts | null,
  kind: "lgs" | "vendor" = "lgs",
  name = "Grand Line Games",
) => storeInviteEmail(name, "owner@example.test", ORIGIN, LINK, kind, gift);
const granted = (gift: GiftFacts, name = "Grand Line Games") =>
  giftGrantedEmail(name, "owner@example.test", ORIGIN, STORE_ID, gift);
const reminder = (daysLeft: number, name = "Grand Line Games") =>
  giftReminderEmail(name, "owner@example.test", ORIGIN, STORE_ID, {
    daysLeft,
    untilLabel: "Dec 4, 2026",
    price: "$35",
  });
const ended = (name = "Grand Line Games") =>
  giftEndedEmail(name, "owner@example.test", ORIGIN, STORE_ID, { price: "$35" });

const every = (name?: string): Array<[string, EmailMessage]> => [
  ["invite timed", invite(timed(60), "lgs", name)],
  ["invite founding", invite(founding, "lgs", name)],
  ["invite vendor", invite(timed(30), "vendor", name)],
  ["invite no gift", invite(null, "lgs", name)],
  ["granted timed", granted(timed(60), name)],
  ["granted founding", granted(founding, name)],
  ["reminder week", reminder(7, name)],
  ["reminder last day", reminder(1, name)],
  ["ended", ended(name)],
];

describe("storeInviteEmail with a gift", () => {
  it("says the store is in, with a party, when there is a gift", () => {
    expect(invite(timed(60)).subject).toBe(
      "You're in: Grand Line Games is in the cardflare beta 🎉",
    );
    expect(invite(founding).subject).toBe(
      "Grand Line Games is a cardflare Founding Store 🎉",
    );
    expect(invite(null).subject).toBe("Grand Line Games is in the cardflare beta");
  });

  it("leads with You're in.", () => {
    for (const email of [invite(timed(60)), invite(founding), invite(null)]) {
      expect(email.html).toContain("You're in.");
      expect(email.text).toContain("You're in.");
    }
  });

  it("puts a timed gift in the ticket, in both parts", () => {
    const email = invite(timed(60));
    for (const body of [email.html, email.text]) {
      expect(body).toContain("YOUR ULTRA PASS");
      expect(body).toContain("60 DAYS");
      expect(body).toContain("of cardflare Ultra. On us. No card.");
      expect(body).toContain(
        "Ends Dec 4, 2026. Keep it after for $35 a month, locked in for life.",
      );
    }
  });

  it("puts a Founding Store in the ticket, in both parts", () => {
    const email = invite(founding);
    for (const body of [email.html, email.text]) {
      expect(body).toContain("FOUNDING STORE");
      expect(body).toContain("FOR LIFE");
      expect(body).toContain("cardflare Ultra, free, for as long as cardflare exists.");
      expect(body).toContain(
        "You're one of ten Founding Stores getting it off the ground.",
      );
    }
  });

  it("drops the trial paragraph when Ultra is a gift, and keeps it when not", () => {
    expect(invite(timed(60)).text).not.toContain("free trial");
    expect(invite(null).text).toContain("14-day free trial of cardflare Ultra");
  });

  it("lists what a game store gets, and what a vendor gets", () => {
    const lgs = invite(timed(60));
    for (const body of [lgs.html, lgs.text]) {
      expect(body).toContain("FlareCast on your TV");
      expect(body).toContain("Every Flare in the room matched to your singles");
      expect(body).toContain("Posts to your followers");
    }
    const vendor = invite(timed(30), "vendor");
    for (const body of [vendor.html, vendor.text]) {
      expect(body).toContain("30 DAYS");
      expect(body).toContain("Buyers walked to your booth");
      expect(body).toContain("Your inventory matched to what they hunt");
      expect(body).not.toContain("FlareCast");
    }
  });

  it("claims the store with the link, and falls back to choosing a password", () => {
    const withLink = invite(timed(60));
    expect(withLink.html).toContain(`href="${LINK}"`);
    expect(withLink.html).toContain("Claim your store");
    expect(withLink.text).toContain(`Claim your store: ${LINK}`);
    expect(withLink.text).toContain("https://cardflare.gg/login/reset");

    const without = storeInviteEmail(
      "Grand Line Games",
      "owner@example.test",
      ORIGIN,
      null,
      "lgs",
      timed(60),
    );
    expect(without.html).toContain('href="https://cardflare.gg/login/reset"');
    expect(without.html).toContain("Choose a password");
    expect(without.html).not.toContain("Claim your store");
  });

  it("keeps the sign-in footer and the not-expecting line", () => {
    const email = invite(timed(60));
    for (const body of [email.html, email.text]) {
      expect(body).toContain("https://cardflare.gg/login");
      expect(body).toMatch(/not expecting this/i);
    }
  });

  it("leaves the player's invitation alone", () => {
    expect(playerInviteEmail("Zach", "z@example.test", ORIGIN).subject).toBe(
      "Your cardflare account is ready",
    );
    expect(
      storeInviteEmail("Zach", "z@example.test", ORIGIN, null, "player").subject,
    ).toBe("Your cardflare account is ready");
  });
});

describe("giftGrantedEmail", () => {
  it("names the gift in the subject", () => {
    expect(granted(timed(60)).subject).toBe(
      "🎁 Grand Line Games: cardflare Ultra is on us",
    );
    expect(granted(founding).subject).toBe(
      "Grand Line Games is a cardflare Founding Store 🎉",
    );
  });

  it("says Surprise, and carries the ticket in both parts", () => {
    const email = granted(timed(60));
    for (const body of [email.html, email.text]) {
      expect(body).toContain("Surprise.");
      expect(body).toContain("60 DAYS");
      expect(body).toContain("$35 a month");
    }
    const life = granted(founding);
    for (const body of [life.html, life.text]) expect(body).toContain("FOR LIFE");
  });

  it("opens the store's console", () => {
    const email = granted(timed(60));
    const url = `https://cardflare.gg/store?as=${STORE_ID}`;
    expect(email.html).toContain(`href="${url}"`);
    expect(email.html).toContain("Open your console");
    expect(email.text).toContain(url);
  });
});

describe("giftReminderEmail", () => {
  it("counts down in the subject", () => {
    expect(reminder(7).subject).toBe("7 days of Ultra left for Grand Line Games");
    expect(reminder(1).subject).toBe("Last day of Ultra for Grand Line Games");
  });

  it("puts the countdown in the ticket, in both parts", () => {
    for (const body of [reminder(7).html, reminder(7).text])
      expect(body).toContain("7 DAYS");
    for (const body of [reminder(1).html, reminder(1).text])
      expect(body).toContain("LAST DAY");
  });

  it("says when it ends, what keeping it costs, and that nothing is lost", () => {
    const email = reminder(7);
    for (const body of [email.html, email.text]) {
      expect(body).toContain("Everything stays on until Dec 4, 2026.");
      expect(body).toContain("$35 a month, locked in for life");
      expect(body).toMatch(/nothing you made is lost/i);
    }
  });

  it("links to keeping Ultra", () => {
    const url = `https://cardflare.gg/store/settings?as=${STORE_ID}`;
    const email = reminder(1);
    expect(email.html).toContain(`href="${url}"`);
    expect(email.html).toContain("Keep Ultra");
    expect(email.text).toContain(url);
  });
});

describe("giftEndedEmail", () => {
  it("says it has ended, warmly", () => {
    const email = ended();
    expect(email.subject).toBe("Your Ultra beta has ended, Grand Line Games");
    for (const body of [email.html, email.text]) {
      expect(body).toContain("Thank you.");
      expect(body).toContain("still there");
      expect(body).toContain("paused");
      expect(body).toContain("$35 a month, locked in for life");
    }
  });

  it("links to keeping Ultra", () => {
    const url = `https://cardflare.gg/store/settings?as=${STORE_ID}`;
    const email = ended();
    expect(email.html).toContain(`href="${url}"`);
    expect(email.text).toContain(url);
  });
});

describe("every gift email", () => {
  it.each(every())("%s has no em dash anywhere", (_label, email) => {
    for (const part of [email.subject, email.html, email.text]) {
      expect(part).not.toContain("—");
    }
  });

  it.each(every())("%s ships a real plain-text part", (_label, email) => {
    expect(email.text.length).toBeGreaterThan(150);
    expect(email.text).not.toMatch(/<[a-z]/i);
  });

  it.each(every())(
    "%s draws the wordmark sized by an explicit height",
    (_label, email) => {
      const img = email.html.match(/<img [^>]*>/g) ?? [];
      expect(img).toHaveLength(1);
      expect(img[0]).toContain('src="https://cardflare.gg/brand/cardflare-wordmark');
      expect(img[0]).toContain('alt="cardflare"');
      expect(img[0]).toMatch(/height="\d+"/);
    },
  );

  it.each(every())("%s keeps to what mail clients draw", (_label, email) => {
    expect(email.html).not.toMatch(/<style|@import|@keyframes|background-image|url\(/i);
    expect(email.html).toContain("max-width:560px");
  });

  it.each(every("Grand <b>& Games"))("%s escapes the store name", (_label, email) => {
    expect(email.html).not.toContain("<b>");
    expect(email.html).toContain("Grand &lt;b&gt;&amp; Games");
  });
});
