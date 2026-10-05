/**
 * Ultra as a gift, the parts any file may import: the choices an admin
 * picks from, the day count, and the words on the green bar.
 *
 * The founder: "a quick way to send an extended trial to people with no
 * CC info required - just a full stack setup and they have 30 days to
 * try it out... the option to choose lifetime, or 30 days, 60 days,
 * etc. And there will be a green block at the top that says how many
 * days they have left in the trial." Lifetime is a Founding Store, and
 * there are only ten of them: the scarcity is what makes it a thing to
 * be proud of rather than a discount.
 *
 * Kept free of server imports so the bar's words are unit-testable, and
 * mirrored word for word in the app by `mobile/src/gift-copy.ts`.
 */

export const GIFT_CHOICES = ["none", "30", "60", "90", "founding"] as const;
export type GiftChoice = (typeof GIFT_CHOICES)[number];

export function isGiftChoice(value: string): value is GiftChoice {
  return (GIFT_CHOICES as readonly string[]).includes(value);
}

/** How the admin's picker says each one. */
export const GIFT_CHOICE_LABELS: Record<GiftChoice, string> = {
  none: "No gift",
  "30": "30 days of Ultra",
  "60": "60 days of Ultra",
  "90": "90 days of Ultra",
  founding: "Founding Store (Ultra for life)",
};

/** Founding Stores that may exist at once. */
export const FOUNDING_STORE_CAP = 10;

/**
 * What a store that was in the beta pays to keep Ultra, for as long as
 * it keeps it. Charged only when STRIPE_PRICE_ULTRA_FOUNDING names a
 * Stripe price at this amount; without it the standard price is charged
 * and every sentence says the standard price.
 */
export const FOUNDING_PRICE_LABEL = "$35";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Whole days left, counting a part day as a day; never below zero. */
export function giftDaysLeft(until: string, now: number = Date.now()): number {
  const end = Date.parse(until);
  if (!Number.isFinite(end)) return 0;
  return Math.max(0, Math.ceil((end - now) / DAY_MS));
}

/** The bar's state, worked out on the server and drawn by both clients. */
export type GiftBar =
  | { state: "founding" }
  | {
      state: "gift";
      daysLeft: number;
      untilLabel: string;
      /** What keeping Ultra costs this store, a month. */
      price: string;
      /** A card is on file and the paid plan starts when the gift ends. */
      kept: boolean;
    }
  | { state: "gift-ended"; price: string }
  | { state: "trial"; daysLeft: number; untilLabel: string; price: string };

export interface GiftBarCopy {
  title: string;
  detail: string;
  /** Three days or fewer: the bar says so louder. */
  urgent: boolean;
  /** The one button, for an owner on the website, or null for none. */
  action: string | null;
}

function daysLine(daysLeft: number): string {
  if (daysLeft <= 1) return "Last day";
  return `${daysLeft} days left`;
}

export function giftBarCopy(bar: GiftBar): GiftBarCopy {
  switch (bar.state) {
    case "founding":
      return {
        title: "Founding Store · Ultra, free for life",
        detail:
          "Thank you for getting cardflare off the ground. Everything is on, for good.",
        urgent: false,
        action: null,
      };
    case "gift": {
      const urgent = bar.daysLeft <= 3;
      if (bar.kept) {
        return {
          title: `Ultra beta · ${daysLine(bar.daysLeft)}`,
          detail: `You're keeping Ultra. Your ${bar.price} a month plan starts ${bar.untilLabel}.`,
          urgent: false,
          action: null,
        };
      }
      return {
        title: `Ultra beta · ${daysLine(bar.daysLeft)}`,
        detail: urgent
          ? `Keep Ultra for ${bar.price} a month, locked in for life, or it switches off ${bar.untilLabel}. Nothing you made is lost either way.`
          : `Everything is on, no card needed. Keep Ultra any time for ${bar.price} a month, locked in for life.`,
        urgent,
        action: "Keep Ultra",
      };
    }
    case "gift-ended":
      return {
        title: "Your Ultra beta has ended",
        detail: `Everything you made is still here. Keep Ultra for ${bar.price} a month, locked in for life.`,
        urgent: false,
        action: "Keep Ultra",
      };
    case "trial":
      return {
        title: `Ultra trial · ${daysLine(bar.daysLeft)}`,
        detail: `${bar.price} a month from ${bar.untilLabel}. Cancel any time from Settings.`,
        urgent: false,
        action: null,
      };
  }
}
