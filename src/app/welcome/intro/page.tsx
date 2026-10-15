import type { Metadata } from "next";
import Link from "next/link";

import { Logo } from "@/components/brand/logo";
import { IntroCards } from "@/components/onboarding/intro-cards";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Welcome to cardflare",
  robots: { index: false, follow: false },
};

/**
 * Sign-up's last screen, and Settings → Help → "Replay the intro": three
 * cards, then "Post your first Flare". The founder: "a quick 30 second
 * introduction to the app when people first sign up". Open to anyone;
 * it only says what cardflare is.
 */
export default function WelcomeIntroPage() {
  return (
    <main
      id="main"
      className="flex min-h-dvh flex-col items-center justify-center gap-8 px-5 py-16"
    >
      <Link href="/" aria-label={`${SITE.name} home`}>
        <Logo size={40} priority />
      </Link>
      <IntroCards />
    </main>
  );
}
