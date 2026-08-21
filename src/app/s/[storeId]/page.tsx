import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BadgeCheck, Globe, MapPin, Phone, Store as StoreIcon } from "lucide-react";

import { Card } from "@/components/ui/card";
import { buttonStyles } from "@/components/ui/button";
import { publicStore } from "@/lib/stores/public-profile";

export const metadata: Metadata = {
  title: "Store",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * A store, as a player sees it — claimed or not.
 *
 * The point of the directory: "I do NOT want the CardFlare store
 * experience to look empty just because an LGS has not personally signed
 * up." So this renders for a shop that has never heard of CardFlare, and
 * it is careful about what it says.
 *
 * FACTUAL INFORMATION ONLY on an unclaimed listing. No logo, no photos,
 * no store-written description, no reviews - none of which we have a
 * licence to reproduce. A generic mark, the address, and an honest label
 * saying nobody at the shop has claimed this yet.
 *
 * Verified and Ultra are drawn as two separate marks because they mean
 * two different things, and the help text says which is which.
 */
export default async function StoreProfilePage({
  params,
}: {
  params: Promise<{ storeId: string }>;
}) {
  const { storeId } = await params;
  const store = await publicStore(storeId);

  if (!store) notFound();

  return (
    <main
      id="main"
      className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-4 px-4 pt-6 pb-16"
    >
      <Card className="flex flex-col gap-4 p-5">
        <div className="flex items-start gap-4">
          {/* The placeholder, deliberately. A shop's own logo is theirs. */}
          <span className="flex size-14 shrink-0 items-center justify-center rounded-xl border border-border bg-elevated">
            <StoreIcon className="size-6 text-text-muted" aria-hidden="true" />
          </span>

          <div className="min-w-0 flex-1">
            <h1 className="flex flex-wrap items-center gap-2 text-xl font-bold text-text-primary">
              {store.name}
              {store.verified && (
                <BadgeCheck
                  className="size-5 text-accent"
                  aria-label="CardFlare Verified"
                />
              )}
              {store.ultra && (
                <span className="rounded-full border border-border-strong px-2 py-0.5 text-[10px] font-semibold tracking-wider text-text-secondary uppercase">
                  Ultra
                </span>
              )}
            </h1>

            {store.verified ? (
              <p className="mt-1 text-xs text-text-muted">
                CardFlare Verified means CardFlare has confirmed that this profile is
                controlled by the listed business. It is not an endorsement or guarantee
                of the business.
              </p>
            ) : (
              <p className="mt-1 text-xs text-text-muted">Unclaimed listing</p>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-2 text-sm text-text-secondary">
          {store.address && (
            <p className="flex items-start gap-2">
              <MapPin className="mt-0.5 size-4 shrink-0 text-text-muted" aria-hidden />
              {store.address}
            </p>
          )}
          {store.phone && (
            <p className="flex items-center gap-2">
              <Phone className="size-4 shrink-0 text-text-muted" aria-hidden />
              {store.phone}
            </p>
          )}
          {store.website && (
            <p className="flex items-center gap-2">
              <Globe className="size-4 shrink-0 text-text-muted" aria-hidden />
              <a
                href={store.website}
                rel="noreferrer nofollow"
                target="_blank"
                className="truncate text-accent"
              >
                {store.website}
              </a>
            </p>
          )}
        </div>

        {store.unclaimed && (
          <div className="flex flex-col gap-2 rounded-lg border border-border bg-elevated p-4">
            <p className="text-sm font-semibold text-text-primary">
              Own or manage this store?
            </p>
            <p className="text-xs text-text-muted">
              Claiming lets you keep the details right and run rooms from your own
              counter code. CardFlare confirms ownership before anything changes.
            </p>
            <Link
              href={`/s/${store.storeId}/claim`}
              className={buttonStyles("secondary", "sm")}
            >
              Claim this store
            </Link>
          </div>
        )}
      </Card>

      {/* Attribution travels with the record. Overture Places is a mix of
          licences, so the line comes from the source row rather than from
          a constant. */}
      {store.attribution && (
        <p className="text-xs text-text-muted">Listing data: {store.attribution}</p>
      )}
    </main>
  );
}
