import "server-only";

import { headers } from "next/headers";

/**
 * Coarse per-client key for rate limiting.
 *
 * Trusts `x-forwarded-for` because the app runs behind Vercel's proxy, which
 * sets it. Spoofable if the app were ever exposed directly, so this is a
 * throttle rather than an access control.
 */
export async function clientKey(): Promise<string> {
  const headerList = await headers();
  const forwarded = headerList.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim();

  return ip || headerList.get("x-real-ip") || "unknown";
}

/** Records which page a submission came from, for later attribution. */
export async function requestSource(): Promise<string | null> {
  const referer = (await headers()).get("referer");
  if (!referer) return null;

  try {
    const url = new URL(referer);
    return `${url.host}${url.pathname}`.slice(0, 120);
  } catch {
    return null;
  }
}
