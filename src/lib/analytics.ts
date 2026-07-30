/**
 * Analytics facade.
 *
 * No provider is wired up yet. Every call is a no-op unless a `window.plausible`
 * style collector is present, so the site behaves identically when analytics are
 * blocked, absent, or refused — which is the point.
 *
 * Only event names and coarse, non-identifying properties are ever sent. Never
 * pass an email address, name, or free-text comment through here.
 */
export type AnalyticsEvent =
  | "landing_page_viewed"
  | "primary_cta_clicked"
  | "store_pilot_cta_clicked"
  | "waitlist_form_started"
  | "waitlist_submitted"
  | "waitlist_submission_failed";

type AnalyticsProps = Record<string, string | number | boolean>;

interface PlausibleWindow {
  plausible?: (event: string, options?: { props?: AnalyticsProps }) => void;
}

export function track(event: AnalyticsEvent, props?: AnalyticsProps): void {
  if (typeof window === "undefined") return;

  const collector = (window as PlausibleWindow).plausible;
  if (typeof collector !== "function") return;

  try {
    collector(event, props ? { props } : undefined);
  } catch {
    // Analytics must never break the page.
  }
}
