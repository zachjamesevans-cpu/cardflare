/**
 * The words on the green bar, mirrored word for word from the website's
 * src/lib/stores/gift-shared.ts (`giftBarCopy`). The server works out
 * the bar's state; both clients say it the same way. When a sentence
 * changes there, it changes here: tests/unit/gift-app.test.ts runs both
 * over every state and fails if they part.
 *
 * `action` is the website's one button. The app never draws it as a
 * button (buying happens on the website); gift-bar.tsx says where to
 * find it instead.
 */

/**
 * The bar's state, worked out on the server and drawn by both clients.
 * Copied verbatim from the website's src/lib/stores/gift-shared.ts; the
 * words for each state are in gift-copy.ts.
 */
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
