import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Flame, MapPin, Radio } from "lucide-react";

import { Logo } from "@/components/brand/logo";
import { SignupForm } from "@/components/auth/signup-form";
import { Button, ButtonLink } from "@/components/ui/button";
import { signOutToSignup } from "@/lib/auth/actions";
import { getViewer, type Viewer } from "@/lib/auth/session";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Create your account",
  description:
    "Join cardflare: post the cards you need and get connected with the people nearby who have them, then trade in person.",
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
  if (viewer.kind !== "anonymous") return <AlreadySignedIn viewer={viewer} />;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-8 px-4 py-10 sm:py-14">
      <Link href="/" aria-label={`${SITE.name} home`} className="self-center">
        <Logo />
      </Link>

      <div className="flex flex-col gap-3 text-center">
        <h1 className="text-3xl font-bold text-text-primary">
          Find your cards. Meet nearby. Trade in person.
        </h1>
        <p className="text-text-secondary">
          Post your wants and cardflare connects you with the people who have them:
          around the corner, at your local store, at a show. Free, and your binder
          follows you everywhere.
        </p>
      </div>

      {/* The product in three true lines. */}
      <ul className="flex flex-col gap-2 text-sm text-text-secondary">
        <li className="flex items-center gap-2.5">
          <Radio className="size-4 shrink-0 text-accent" aria-hidden="true" />
          Post a Flare for any card and the people near you see what you are hunting.
        </li>
        <li className="flex items-center gap-2.5">
          <MapPin className="size-4 shrink-0 text-accent" aria-hidden="true" />
          Local shows every hunt around you. Have the card? Message them.
        </li>
        <li className="flex items-center gap-2.5">
          <Flame className="size-4 shrink-0 text-accent" aria-hidden="true" />
          Earn Embers for every confirmed trade and spend them on your look.
        </li>
      </ul>

      <SignupForm />

      {/* The same promise the app's welcome screen makes. */}
      <p className="text-center text-sm text-text-muted">
        Built for collectors, not marketplaces.
      </p>
    </main>
  );
}

/**
 * The page a signed-in visitor sees instead of the form.
 *
 * This used to be a silent `redirect("/")`, and the founder — signed in
 * as admin on his own site, as he always is — pressed "Join free",
 * landed back where he started and reasonably reported the button
 * "leads nowhere". A page that will not do the thing its button
 * promised has to say so and offer the two honest ways forward: carry
 * on as who you are, or sign out and come back as somebody new.
 */
function AlreadySignedIn({
  viewer,
}: {
  viewer: Extract<Viewer, { kind: "admin" | "store" | "unaffiliated" }>;
}) {
  const [homeHref, homeLabel] =
    viewer.kind === "admin"
      ? ["/admin", "Go to the admin console"]
      : viewer.kind === "store"
        ? ["/store", "Go to your store dashboard"]
        : ["/", "Back to the homepage"];

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-8 px-4 py-10 sm:py-14">
      <Link href="/" aria-label={`${SITE.name} home`} className="self-center">
        <Logo />
      </Link>

      <div className="flex flex-col gap-3 text-center">
        <h1 className="text-3xl font-bold text-text-primary">
          You are already signed in.
        </h1>
        <p className="text-text-secondary">
          This page creates a new player account, and you are signed in as{" "}
          <span className="font-semibold text-text-primary">{viewer.user.email}</span>.
          To make a fresh account, sign out first and this form will be waiting.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <ButtonLink href={homeHref} size="lg" className="w-full">
          {homeLabel}
        </ButtonLink>
        <form action={signOutToSignup}>
          <Button type="submit" size="lg" variant="secondary" className="w-full">
            Sign out and create a new account
          </Button>
        </form>
      </div>
    </main>
  );
}
