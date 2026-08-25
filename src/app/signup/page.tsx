import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Flame, QrCode, Sparkles } from "lucide-react";

import { Logo } from "@/components/brand/logo";
import { SignupForm } from "@/components/auth/signup-form";
import { getViewer } from "@/lib/auth/session";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Create your account",
  description:
    "Join cardflare: post the cards you are hunting, see who in the room has them, and trade in person.",
};

export const dynamic = "force-dynamic";

/**
 * The front door for somebody arriving with nothing - no invite, no
 * account, maybe a TestFlight link still warm in their pocket.
 *
 * The pitch above the form is the product in three lines, each one a
 * thing that actually exists today; nothing on this page promises a
 * feature that has not shipped. The form asks for the two things an
 * account is made of, and every other question gets its own screen
 * after, matching the app's flow step for step.
 */
export default async function SignupPage() {
  const viewer = await getViewer();
  if (viewer.kind === "player") redirect("/profile");
  if (viewer.kind !== "anonymous") redirect("/");

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-8 px-4 py-10 sm:py-14">
      <Link href="/" aria-label={`${SITE.name} home`} className="self-center">
        <Logo />
      </Link>

      <div className="flex flex-col gap-3 text-center">
        <h1 className="text-3xl font-bold text-text-primary">
          The room can see what you are hunting.
        </h1>
        <p className="text-text-secondary">
          Post your wants, see who has them, trade face to face. Free, and your binder
          follows you to every store.
        </p>
      </div>

      {/* The product in three true lines. */}
      <ul className="flex flex-col gap-2 text-sm text-text-secondary">
        <li className="flex items-center gap-2.5">
          <QrCode className="size-4 shrink-0 text-accent" aria-hidden="true" />
          Scan the code on any counter and you are in the room.
        </li>
        <li className="flex items-center gap-2.5">
          <Flame className="size-4 shrink-0 text-accent" aria-hidden="true" />
          Earn Embers for every confirmed trade.
        </li>
        <li className="flex items-center gap-2.5">
          <Sparkles className="size-4 shrink-0 text-accent" aria-hidden="true" />
          Open packs, dress your showcase, make your profile yours.
        </li>
      </ul>

      <SignupForm />
    </main>
  );
}
