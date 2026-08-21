import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";

import { Card } from "@/components/ui/card";
import { ClaimForm } from "@/components/stores/claim-form";
import { publicStore } from "@/lib/stores/public-profile";

export const metadata: Metadata = {
  title: "Claim this store",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * "Own or manage this store?" — the page behind that button.
 *
 * The button has been on every unclaimed listing since the directory
 * shipped and pointed at nothing, which is the one thing AGENTS.md says
 * plainly not to do: no dead links. It is the whole point of an
 * unclaimed listing, too — a directory of shops that cannot be claimed
 * is a directory, not a product.
 *
 * NO ACCOUNT REQUIRED. The person behind the counter has never heard of
 * CardFlare; asking them to sign up before they can say "this is mine"
 * is a wall in front of the exact door this opens. They give a name and
 * an address, an admin reads it, and the account comes later if the
 * answer is yes.
 *
 * A CLAIMED STORE 404s HERE rather than showing a form nobody will
 * read. So does a draft: an unpublished listing is not public, and it
 * must not become reachable through its own claim page.
 */
export default async function ClaimStorePage({
  params,
}: {
  params: Promise<{ storeId: string }>;
}) {
  const { storeId } = await params;
  const store = await publicStore(storeId);

  if (!store || !store.unclaimed) notFound();

  return (
    <main className="mx-auto flex w-full max-w-xl flex-col gap-5 px-4 py-10">
      <Link
        href={`/s/${store.storeId}`}
        className="flex items-center gap-1 text-sm text-text-secondary underline-offset-4 hover:underline"
      >
        <ChevronLeft className="size-4" aria-hidden="true" />
        Back to {store.name}
      </Link>

      <Card className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <h1 className="text-xl font-semibold text-text-primary">
            Claim {store.name}
          </h1>
          <p className="text-sm text-text-secondary">
            CardFlare listed this shop from public map data so players could find it. If
            you work there, tell us and we&rsquo;ll hand the listing over.
          </p>
          {store.address && <p className="text-xs text-text-muted">{store.address}</p>}
        </div>

        {/* What actually happens, before they type. Somebody deciding
            whether to fill in a form deserves to know what it costs and
            what it buys, and "a person reads it" is the honest answer to
            "how long will this take". */}
        <div className="flex flex-col gap-2 rounded-lg border border-border bg-elevated p-4">
          <p className="text-sm font-semibold text-text-primary">What happens next</p>
          <ul className="flex flex-col gap-1.5 text-xs text-text-muted">
            <li>A person at CardFlare reads this and emails you back.</li>
            <li>
              Nothing about the listing changes until we&rsquo;ve confirmed you work
              there.
            </li>
            <li>
              Once it&rsquo;s yours you can correct the details and run rooms from your
              own counter code. It stays free.
            </li>
          </ul>
        </div>

        <ClaimForm storeId={store.storeId} storeName={store.name} />
      </Card>
    </main>
  );
}
