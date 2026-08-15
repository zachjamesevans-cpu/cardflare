import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { Logo } from "@/components/brand/logo";
import { PasswordSignInForm } from "@/components/auth/password-sign-in-form";
import { ProviderButtons } from "@/components/auth/provider-buttons";
import { SignInForm } from "@/components/auth/sign-in-form";
import { safeNextPath } from "@/lib/auth/redirect";
import { getViewer } from "@/lib/auth/session";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Sign in",
  description: `Sign in to ${SITE.name}.`,
  // Nothing here should be indexed or appear in the sitemap.
  robots: { index: false, follow: false },
};

const ERRORS: Record<string, string> = {
  "invalid-link": "That sign-in link has expired or was already used.",
  "missing-code": "That sign-in link was incomplete.",
  "provider-unavailable": "That sign-in method is not available.",
  "provider-failed": "We could not start that sign-in. Please try again.",
  unavailable: "Sign-in is unavailable right now. Please try again in a moment.",
};

export default async function LoginPage(props: PageProps<"/login">) {
  const params = await props.searchParams;
  const rawNext = firstValue(params.next);
  const next = rawNext ? safeNextPath(rawNext) : undefined;
  const error = ERRORS[firstValue(params.error) ?? ""];

  /*
   * Somebody already signed in does not want a sign-in form.
   *
   * The footer's "Store sign-in" link points here unconditionally, because the
   * landing page is statically prerendered and asking who the visitor is would
   * turn every visit to the marketing site into a round trip to the auth
   * server. So the question is answered here instead, on a page that is
   * already dynamic and already has the session in hand.
   *
   * `safeNextPath` sends them wherever they were headed, defaulting to
   * `/store` — which forwards an admin to `/admin` and shows an unaffiliated
   * account the "no store yet" explanation. That is the same destination
   * signing in would have produced, so the link behaves as though they had.
   */
  const viewer = await getViewer();

  if (viewer.kind !== "anonymous") redirect(safeNextPath(rawNext));

  return (
    <main
      id="main"
      className="flex min-h-dvh flex-col items-center justify-center gap-8 px-5 py-16"
    >
      <Link href="/" aria-label={`${SITE.name} home`}>
        <Logo size={40} priority />
      </Link>

      <div className="flex w-full max-w-md flex-col gap-5">
        <div className="flex flex-col gap-2 text-center">
          <h1 className="text-2xl font-bold tracking-tight text-text-primary">
            Sign in to {SITE.name}
          </h1>
          <p className="text-text-secondary">For stores taking part in the beta.</p>
        </div>

        {error && (
          <p
            role="alert"
            className="rounded-[var(--radius-control)] border border-warning/40 bg-warning/10 px-4 py-3 text-center text-sm text-warning"
          >
            {error}
          </p>
        )}

        {/* Nothing at all unless a provider is actually configured. */}
        <ProviderButtons next={next} />

        <PasswordSignInForm next={next} />

        <p className="text-center text-sm text-text-muted">
          New to CardFlare?{" "}
          <Link href="/signup" className="text-accent hover:underline">
            Create an account
          </Link>
        </p>

        {/*
         * The emailed link is still here, and still matters: it is how someone
         * who has never set a password gets in the first time, and how anyone
         * away from their password manager gets in at all. Behind a native
         * <details> so it stays out of the way without needing any JavaScript
         * to open.
         */}
        <details className="rounded-[var(--radius-panel)] border border-border bg-surface px-6 py-4">
          <summary className="cursor-pointer list-none text-sm font-medium text-text-secondary marker:content-none hover:text-text-primary">
            <span className="underline underline-offset-4">
              Email me a sign-in link instead
            </span>
          </summary>

          <div className="pt-5">
            <SignInForm next={next} />
          </div>
        </details>
      </div>
    </main>
  );
}

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
