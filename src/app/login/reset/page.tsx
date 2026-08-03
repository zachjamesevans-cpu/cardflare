import type { Metadata } from "next";
import Link from "next/link";

import { Logo } from "@/components/brand/logo";
import { ResetRequestForm } from "@/components/auth/reset-request-form";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Set a password",
  robots: { index: false, follow: false },
};

/**
 * One page for two situations that are the same underneath: forgetting a
 * password, and never having had one. An invited store's account exists with
 * no password at all, and Supabase will send a recovery link to it happily,
 * so there is no separate activation flow to build or to keep in step.
 */
export default function ResetPasswordPage() {
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
            Set a password
          </h1>
          <p className="text-text-secondary">
            We will email you a link to choose a new one.
          </p>
        </div>

        <ResetRequestForm />

        <Link
          href="/login"
          className="text-center text-sm text-text-muted underline underline-offset-4 hover:text-text-secondary"
        >
          Back to sign in
        </Link>
      </div>
    </main>
  );
}
