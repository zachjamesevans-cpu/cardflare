import type { Metadata } from "next";
import Link from "next/link";

import { Logo } from "@/components/brand/logo";
import { JoinCodeForm } from "@/components/events/join-code-form";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Join an event",
  description: `Enter the code from your local game store to join a ${SITE.name} event.`,
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * The fallback for players who cannot scan.
 *
 * Printed on every poster beside the QR code, because a meaningful share of
 * players will have a camera that will not focus, a locked-down work phone, or
 * a cracked screen. This has to be a first-class way in, not a consolation.
 */
export default function JoinPage() {
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
            Join an event
          </h1>
          <p className="text-text-secondary">
            Enter the code from the sheet at your store.
          </p>
        </div>

        <JoinCodeForm />
      </div>
    </main>
  );
}
