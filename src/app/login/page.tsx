import type { Metadata } from "next";
import Link from "next/link";

import { Logo } from "@/components/brand/logo";
import { SignInForm } from "@/components/auth/sign-in-form";
import { safeNextPath } from "@/lib/auth/redirect";
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
};

export default async function LoginPage(props: PageProps<"/login">) {
  const params = await props.searchParams;
  const next = firstValue(params.next);
  const error = ERRORS[firstValue(params.error) ?? ""];

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
            {error} Request a new one below.
          </p>
        )}

        <SignInForm next={next ? safeNextPath(next) : undefined} />
      </div>
    </main>
  );
}

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
