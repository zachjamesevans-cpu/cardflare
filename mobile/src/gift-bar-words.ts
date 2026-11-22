import type { GiftBar } from "./gift-copy";

/*
 * What the app's Ultra bar says, apart from the website's copy (see
 * gift-bar.tsx for why): no price, no place to pay, no "beta". Its own
 * file, with no React Native in it, so the unit tests can call it.
 */

/** The title without "beta": the gift is free Ultra, said plainly. */
export function appTitle(title: string): string {
  return title
    .replace("Your Ultra beta has ended", "Your free Ultra has ended")
    .replace("Ultra beta", "Free Ultra");
}

/**
 * The line under the title, in the app: the state and its date, never
 * a price or a place to pay. The founding line has neither, so it is
 * the website's own.
 */
export function appDetail(bar: GiftBar, websiteDetail: string): string {
  switch (bar.state) {
    case "founding":
      return websiteDetail;
    case "gift":
      if (bar.kept) return `You're keeping Ultra after ${bar.untilLabel}.`;
      return bar.daysLeft <= 3
        ? `Ultra switches off ${bar.untilLabel}. Nothing you made is lost.`
        : `Everything is on until ${bar.untilLabel}.`;
    case "gift-ended":
      return "Everything you made is still here.";
    case "trial":
      return `Your trial runs until ${bar.untilLabel}.`;
  }
}
