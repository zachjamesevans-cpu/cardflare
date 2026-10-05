import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  FOUNDING_STORE_CAP,
  GIFT_CHOICES,
  giftBarCopy,
  type GiftBar,
} from "@/lib/stores/gift-shared";

/**
 * Ultra as a gift, on the website.
 *
 * The founder: "a quick way to send an extended trial to people with no
 * CC info required... the option to choose lifetime, or 30 days, 60
 * days, etc. And there will be a green block at the top that says how
 * many days they have left in the trial."
 *
 * The pure half: the bar's words for every state. The pinned half: the
 * invitation's Gift picker, the store page's gift control, the bar above
 * every console tab with its owner-only button, the plan card and the
 * lock never promising a trial the checkout would not give, and the
 * Founding Store mark on the store's page.
 */

const ROOT = resolve(import.meta.dirname, "../..");
const read = (path: string) => readFileSync(resolve(ROOT, path), "utf8");

describe("giftBarCopy", () => {
  it("says a Founding Store is free for life, with no button", () => {
    const copy = giftBarCopy({ state: "founding" });
    expect(copy.title).toBe("Founding Store · Ultra, free for life");
    expect(copy.detail).toContain("cardflare");
    expect(copy.urgent).toBe(false);
    expect(copy.action).toBeNull();
  });

  const gift = (daysLeft: number, kept = false): GiftBar => ({
    state: "gift",
    daysLeft,
    untilLabel: "Dec 4, 2026",
    price: "$35",
    kept,
  });

  it("counts the days of a gift and offers to keep Ultra", () => {
    const copy = giftBarCopy(gift(23));
    expect(copy.title).toBe("Ultra beta · 23 days left");
    expect(copy.detail).toContain("no card needed");
    expect(copy.detail).toContain("$35 a month, locked in for life");
    expect(copy.urgent).toBe(false);
    expect(copy.action).toBe("Keep Ultra");
  });

  it("gets louder in the last three days", () => {
    const copy = giftBarCopy(gift(3));
    expect(copy.urgent).toBe(true);
    expect(copy.detail).toContain("switches off Dec 4, 2026");
    expect(copy.action).toBe("Keep Ultra");
    expect(giftBarCopy(gift(4)).urgent).toBe(false);
  });

  it("says the last day as the last day", () => {
    expect(giftBarCopy(gift(1)).title).toBe("Ultra beta · Last day");
    expect(giftBarCopy(gift(0)).title).toBe("Ultra beta · Last day");
  });

  it("stops asking once the store has kept Ultra", () => {
    const copy = giftBarCopy(gift(2, true));
    expect(copy.detail).toBe(
      "You're keeping Ultra. Your $35 a month plan starts Dec 4, 2026.",
    );
    expect(copy.urgent).toBe(false);
    expect(copy.action).toBeNull();
  });

  it("says plainly when the gift has ended, and still offers the button", () => {
    const copy = giftBarCopy({ state: "gift-ended", price: "$35" });
    expect(copy.title).toBe("Your Ultra beta has ended");
    expect(copy.detail).toContain("Everything you made is still here.");
    expect(copy.action).toBe("Keep Ultra");
  });

  it("draws Stripe's own trial with the same bar and no button", () => {
    const copy = giftBarCopy({
      state: "trial",
      daysLeft: 9,
      untilLabel: "Oct 14, 2026",
      price: "$50",
    });
    expect(copy.title).toBe("Ultra trial · 9 days left");
    expect(copy.detail).toBe(
      "$50 a month from Oct 14, 2026. Cancel any time from Settings.",
    );
    expect(copy.action).toBeNull();
  });
});

describe("the invitation's Gift picker", () => {
  const form = read("src/components/admin/invite-store-form.tsx");
  const page = read("src/app/admin/stores/page.tsx");

  it("posts a gift chosen from every choice, defaulting to none", () => {
    expect(form).toContain('name="gift"');
    expect(form).toContain('defaultValue="none"');
    expect(form).toContain("GIFT_CHOICES.map");
    expect(form).toContain("GIFT_CHOICE_LABELS");
    expect(form).toContain("No card needed. They get Ultra the moment they sign in.");
    expect(form).toContain('errorFor(state, "gift")');
    expect(GIFT_CHOICES).toEqual(["none", "30", "60", "90", "founding"]);
  });

  it("says how many Founding Store places are left, and closes at none", () => {
    expect(form).toContain("of ${FOUNDING_STORE_CAP} left");
    expect(form).toContain('disabled={choice === "founding" && foundingLeft <= 0}');
    expect(page).toContain("foundingStoresTaken()");
    expect(page).toContain("FOUNDING_STORE_CAP - foundingTaken");
    expect(page).toContain("<InviteStoreForm foundingLeft={foundingLeft} />");
    expect(FOUNDING_STORE_CAP).toBe(10);
  });

  it("still invites with the same button", () => {
    expect(form).toContain('"Invite store"');
  });
});

describe("a store's admin page", () => {
  const page = read("src/app/admin/stores/[id]/page.tsx");
  const control = read("src/components/admin/store-gift-control.tsx");

  it("draws the gift control beside the listing controls", () => {
    expect(page).toContain("<StoreListingControls");
    expect(page).toContain("<StoreGiftControl");
    expect(page).toContain("giftForStore(");
    expect(page).toContain("giftFacts(");
    expect(page).toContain("giftDaysLeft(");
  });

  it("says the current gift in one line", () => {
    expect(page).toContain('"Founding Store, Ultra for life"');
    expect(page).toContain("days of Ultra, ends ${facts.untilLabel}");
    expect(page).toContain("Gift ended ${ended}");
    expect(page).toContain('"No gift"');
  });

  it("posts giftStoreAction with the store and the choice", () => {
    expect(control).toContain('"use client"');
    expect(control).toContain("useActionState(giftStoreAction");
    expect(control).toContain('name="storeId"');
    expect(control).toContain('name="gift"');
    expect(control).toContain('"End the gift"');
    expect(control).toContain('"Save gift"');
    expect(control).toContain("state.message");
  });
});

describe("the green bar", () => {
  const bar = read("src/components/stores/gift-bar.tsx");
  const tabs = read("src/components/stores/store-tabs.tsx");

  it("is drawn from the server's state in the shared words", () => {
    expect(bar).not.toContain('"use client"');
    expect(bar).toContain("await giftBarFor(storeId)");
    expect(bar).toContain("if (!bar) return null");
    expect(bar).toContain("giftBarCopy(bar)");
  });

  it("is solid accent, quieter once the gift has ended", () => {
    expect(bar).toContain("bg-accent");
    expect(bar).toContain("text-accent-contrast");
    expect(bar).toContain("Ends soon");
    expect(bar).toContain('bar.state === "gift-ended"');
    expect(bar).toContain("border-accent/50");
    for (const icon of ["Sparkles", "Gift", "Timer"]) expect(bar).toContain(icon);
  });

  it("offers Keep Ultra to an owner only, through the checkout action", () => {
    expect(bar).toContain("owner && copy.action !== null");
    expect(bar).toContain("action={startUltraCheckoutAction}");
    expect(bar).toContain('type="hidden" name="storeId"');
  });

  it("sits above the tabs, so every console page has it", () => {
    expect(tabs).toContain('<GiftBar storeId={storeId} owner={role === "owner"} />');
    expect(tabs.indexOf("<GiftBar")).toBeLessThan(tabs.indexOf("<StoreTabsNav"));
  });

  it("is drawn directly on the console pages without a tab bar", () => {
    for (const path of [
      "src/app/store/event-hub/[displayId]/page.tsx",
      "src/app/store/setup/page.tsx",
    ]) {
      const source = read(path);
      expect(source, path).not.toContain("<StoreTabs ");
      expect(source, path).toContain(
        '<GiftBar storeId={store.id} owner={store.role === "owner"} />',
      );
    }
  });
});

describe("the plan card and the lock", () => {
  const card = read("src/components/stores/billing-card.tsx");
  const settings = read("src/app/store/settings/page.tsx");
  const locked = read("src/components/stores/ultra-locked.tsx");

  it("never promise a beta store a free trial", () => {
    for (const source of [card, locked]) {
      expect(source).toContain('"Keep Ultra"');
      expect(source).toContain(
        "a month, locked in for life. Cancel any time from Settings.",
      );
    }
    expect(locked).toContain("ultraOfferFor(storeId)");
    expect(settings).toContain("ultraOfferFor(store.id)");
    expect(settings).toContain("offer={offer}");
  });

  it("gives a Founding Store nothing to start", () => {
    expect(card).toContain('"Founding Store. Ultra is yours, free, for life."');
    expect(card).toContain("const canStart = !founding &&");
    expect(settings).toContain("giftForStore(store.id)");
    expect(settings).toContain("founding={founding}");
  });
});

describe("the Founding Store mark", () => {
  const header = read("src/components/stores/store-page-header.tsx");

  it("is an accent outline pill beside the Ultra mark", () => {
    expect(header).toContain("{founding && (");
    expect(header).toContain("border-accent/60");
    expect(header).toContain('<Sparkles className="size-3.5" aria-hidden="true" />');
    expect(header).toContain("Founding Store");
  });

  it("is threaded from the public store to every header", () => {
    expect(read("src/app/s/[storeId]/page.tsx")).toContain("founding={store.founding}");
    expect(read("src/app/store/setup/page.tsx")).toContain("founding={founding}");
  });
});
