/**
 * What Supabase's answer to a token grant means to the phone, or null
 * when it is a grant. Free of server imports so a unit test can hold
 * the app's sign-out rule to it.
 *
 * Every non-OK used to come back as 401, and the app signs out on a
 * refused refresh, so one Supabase rate limit or bad minute signed
 * people out for nothing. Now only a real rejection of the credential
 * is a 401, and the refresh one carries its own word ("invalid-refresh")
 * so the app can tell "your session is over" from anything else. A rate
 * limit stays a 429, and a 5xx (or an OK with no token in it, which is
 * not an answer at all) is a 503 "upstream": try again later.
 */
export function grantRefusal(
  action: "sign-in" | "sign-up" | "refresh",
  status: number,
  gotToken: boolean,
): { status: number; error: string } | null {
  const ok = status >= 200 && status < 300;
  if (status === 429) return { status: 429, error: "rate-limited" };
  if (status >= 500 || (ok && !gotToken)) return { status: 503, error: "upstream" };
  if (ok) return null;
  return action === "refresh"
    ? { status: 401, error: "invalid-refresh" }
    : { status: 401, error: "invalid-credentials" };
}
