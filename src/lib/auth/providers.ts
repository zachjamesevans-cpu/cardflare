/**
 * Which social sign-ins are actually available.
 *
 * A "Continue with Google" button that has no Google client behind it is a
 * dead control — it sends somebody to a Supabase error page and tells them
 * nothing. PRODUCT.md forbids that, so no provider button renders unless this
 * deployment says the provider is configured.
 *
 * Configuration lives in two places that must agree, and only one of them is
 * in this repository:
 *
 *   1. Supabase → Authentication → Providers, where the client id and secret
 *      go. Never in source control.
 *   2. `AUTH_PROVIDERS`, a comma-separated list naming what was configured in
 *      step 1.
 *
 * Deliberately two steps rather than one. There is no API that reliably
 * reports which providers a Supabase project has enabled, so the alternative
 * would be guessing — and guessing wrong renders exactly the dead button this
 * exists to prevent. Unset means none, so the honest default is silence.
 *
 * Not `NEXT_PUBLIC_`, even though the list is not a secret. Next inlines
 * `NEXT_PUBLIC_*` at build time, so turning a provider on would need a rebuild
 * rather than a restart — and this is read only on the server: by the sign-in
 * page, which is a Server Component, and by the Server Action behind the
 * button.
 *
 * Free of server-only imports so it stays directly unit-testable.
 */

export const OAUTH_PROVIDERS = ["google", "apple"] as const;

export type OAuthProvider = (typeof OAUTH_PROVIDERS)[number];

export const PROVIDER_LABELS: Record<OAuthProvider, string> = {
  google: "Google",
  apple: "Apple",
};

function isProvider(value: string): value is OAuthProvider {
  return (OAUTH_PROVIDERS as readonly string[]).includes(value);
}

/**
 * Parses the configured list.
 *
 * Unknown names are dropped rather than throwing. A typo in an environment
 * variable should cost one missing button, not a sign-in page that will not
 * render — the password form behind it still has to work.
 */
export function parseProviders(raw: string | undefined): OAuthProvider[] {
  if (!raw) return [];

  const seen = new Set<OAuthProvider>();

  for (const part of raw.split(",")) {
    const name = part.trim().toLowerCase();
    if (isProvider(name)) seen.add(name);
  }

  return OAUTH_PROVIDERS.filter((provider) => seen.has(provider));
}

export function enabledProviders(): OAuthProvider[] {
  return parseProviders(process.env.AUTH_PROVIDERS);
}

/**
 * Whether a provider named in a form submission may be used.
 *
 * A Server Action is a public POST endpoint, so the provider name is
 * attacker-controlled. Checking it against the enabled list keeps somebody
 * from starting an OAuth flow this deployment never turned on.
 */
export function isProviderEnabled(value: string): value is OAuthProvider {
  return isProvider(value) && enabledProviders().includes(value);
}
