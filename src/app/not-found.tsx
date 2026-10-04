import type { Metadata } from "next";
import Link from "next/link";

import { Logo } from "@/components/brand/logo";
import { ButtonLink } from "@/components/ui/button";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Not found",
  robots: { index: false, follow: false },
};

/**
 * The page for an address that goes nowhere.
 *
 * Without this file Next draws its own bare page, with none of the
 * site's type, colour or logo on it, which is what the audit hit at
 * /poster. One door home and one to the Feed, which between them
 * cover everybody who can land here.
 */
export default function NotFound() {
  return (
    <main
      id="main"
      className="flex min-h-dvh flex-col items-center justify-center gap-8 px-5 py-16 text-center"
    >
      <Link href="/" aria-label={`${SITE.name} home`}>
        <Logo size={40} priority />
      </Link>

      <div className="flex max-w-md flex-col gap-3">
        <h1 className="text-2xl font-bold text-text-primary">
          There&rsquo;s nothing at this address
        </h1>
        <p className="text-text-secondary">
          The link may be old, or the code may have been trimmed off the end of it.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-3">
        <ButtonLink href="/feed">Open the Feed</ButtonLink>
        <ButtonLink href="/" variant="secondary">
          Home
        </ButtonLink>
      </div>
    </main>
  );
}
