import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";

import { PublicBinder } from "@/components/binder/public-binder";
import { binderOwner, readBinder } from "@/lib/binder/binder";
import { SITE } from "@/lib/site";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ binderId: string }> };

/** The binder a share link names, as anyone signed out would see it. */
async function sharedBinder(raw: string) {
  const id = z.guid().safeParse(raw);
  if (!id.success) return null;
  const owner = await binderOwner(id.data);
  if (!owner) return null;
  const binder = await readBinder(owner, null, id.data);
  return binder ? { owner, binder } : null;
}

/**
 * The preview a chat app draws for the link: whose binder, what it is
 * called and how many cards, with the picture `opengraph-image.tsx`
 * makes of its first pockets. A private binder says nothing at all.
 */
export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const shared = await sharedBinder((await params).binderId);
  const robots = { index: false, follow: false };
  if (!shared) return { title: "Binder", robots };

  const { binder } = shared;
  const title = `${binder.ownerName}'s ${binder.name}`;
  const description = `${binder.count} ${binder.count === 1 ? "card" : "cards"} up for trade on ${SITE.name}. Make an offer on any of them.`;
  return {
    title,
    description,
    robots,
    openGraph: { title, description, type: "website" },
    twitter: { card: "summary_large_image", title, description },
  };
}

/**
 * The share link: cardflare.gg/b/<id>, short enough for a text. Opens
 * the binder for anyone, signed in or not, and in the app on an iPhone
 * that has it (the apple-app-site-association file names /b/*). A
 * binder that is not up for trade is a 404 here, the same as at its
 * long address.
 */
export default async function SharedBinderPage({ params }: Params) {
  const raw = (await params).binderId;
  const id = z.guid().safeParse(raw);
  if (!id.success) notFound();
  const owner = await binderOwner(id.data);
  if (!owner) notFound();
  return <PublicBinder playerId={owner} binderId={id.data} />;
}
