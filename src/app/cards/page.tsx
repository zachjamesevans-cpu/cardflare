import type { Metadata } from "next";
import Link from "next/link";

import { Logo } from "@/components/brand/logo";
import { CardSearch } from "@/components/cards/card-search";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Card search",
  description: `Search One Piece Card Game cards on ${SITE.name}.`,
  // Not indexed while the card pool is being loaded and the search is beta.
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default function CardsPage() {
  return (
    <main id="main" className="flex min-h-dvh flex-col items-center gap-8 px-5 py-12">
      <Link href="/" aria-label={`${SITE.name} home`}>
        <Logo size={40} priority />
      </Link>

      <div className="flex w-full max-w-2xl flex-col gap-6">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-bold tracking-tight text-text-primary">
            Card search
          </h1>
          <p className="text-text-secondary">
            One Piece Card Game. Search by name, nickname, or card number.
          </p>
        </div>

        <CardSearch />
      </div>
    </main>
  );
}
