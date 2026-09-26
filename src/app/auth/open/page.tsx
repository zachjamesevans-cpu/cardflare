import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { safeNextPath } from "@/lib/auth/redirect";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Sign in",
  robots: { index: false, follow: false },
};

/**
 * The one tap between an emailed link and the account it opens.
 *
 * `/auth/confirm` forwards here without touching the token, and the button
 * posts it back to be redeemed. Mail scanners and link previews fetch pages;
 * they do not press buttons, so the token is still unspent when the person
 * it was sent to arrives. See the route for the long version.
 */
export default async function OpenLinkPage({
  searchParams,
}: {
  searchParams: Promise<{ token_hash?: string; next?: string }>;
}) {
  const { token_hash: tokenHash, next } = await searchParams;
  if (!tokenHash) redirect("/login/reset?expired=1");

  return (
    <main
      id="main"
      className="flex min-h-dvh flex-col items-center justify-center gap-8 px-5 py-16"
    >
      <Link href="/" aria-label={`${SITE.name} home`}>
        <Logo size={40} priority />
      </Link>

      <Card className="flex w-full max-w-md flex-col gap-5 text-center">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-bold tracking-tight text-text-primary">
            Welcome to {SITE.name}
          </h1>
          <p className="text-text-secondary">
            One tap to sign in. Next you choose your password.
          </p>
        </div>

        <form method="post" action="/auth/confirm">
          <input type="hidden" name="token_hash" value={tokenHash} />
          <input type="hidden" name="next" value={safeNextPath(next)} />
          <Button type="submit" size="lg" className="w-full">
            Continue
          </Button>
        </form>

        <p className="text-xs text-text-muted">
          The link works once. If it has already been used or has run out,{" "}
          <Link href="/login/reset" className="text-accent hover:text-accent-hover">
            get a fresh one
          </Link>
          .
        </p>
      </Card>
    </main>
  );
}
