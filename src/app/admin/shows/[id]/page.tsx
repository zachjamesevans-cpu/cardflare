import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { JoinPoster } from "@/components/events/join-poster";
import { Badge, Card } from "@/components/ui/card";
import { requireAdmin } from "@/lib/auth/session";
import { formatEventWindow } from "@/lib/events/format";
import { joinQrSvg, joinUrl } from "@/lib/events/qr";
import { findShowById, rosterForShow } from "@/lib/shows/repository";

export const metadata: Metadata = {
  title: "Show",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * One show: its printable code, and who is coming.
 *
 * The roster is the admin's morning-of view — which vendors claimed booths,
 * and therefore whose inventory the code at the door will search.
 */
export default async function ShowPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  // The layout guards too. Duplicated deliberately: a layout is not a
  // security boundary on its own.
  await requireAdmin();
  const { id } = await params;

  const show = await findShowById(id);
  if (!show) notFound();

  const [roster, qrSvg] = await Promise.all([
    rosterForShow(show.id),
    joinQrSvg(show.join_code),
  ]);

  const where = [show.city, show.region].filter(Boolean).join(", ");

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <Link
          href="/admin/shows"
          className="inline-flex w-fit items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Back to shows
        </Link>

        <h2 className="text-xl font-bold text-text-primary">{show.name}</h2>

        <div className="flex flex-wrap items-center gap-3">
          <Badge tone="neutral">
            {formatEventWindow(show.starts_at, show.ends_at, show.timezone)}
          </Badge>
          {where && <Badge tone="neutral">{where}</Badge>}
        </div>
      </div>

      <section className="flex flex-col gap-5" aria-labelledby="show-qr-heading">
        <h2 id="show-qr-heading" className="text-xl font-bold text-text-primary">
          Show code
        </h2>
        <JoinPoster
          kind="show"
          title={show.name}
          subtitle={formatEventWindow(show.starts_at, show.ends_at, show.timezone)}
          joinCode={show.join_code}
          url={joinUrl(show.join_code)}
          qrSvg={qrSvg}
        />
      </section>

      <section className="flex flex-col gap-5" aria-labelledby="roster-heading">
        <div className="flex items-center justify-between gap-4">
          <h2 id="roster-heading" className="text-xl font-bold text-text-primary">
            Vendors
          </h2>
          <span className="text-sm text-text-muted tabular-nums">
            {roster.length} {roster.length === 1 ? "booth" : "booths"}
          </span>
        </div>

        {roster.length === 0 ? (
          <Card className="py-8 text-center text-text-secondary">
            No booths claimed yet. Vendors claim theirs from their own dashboard.
          </Card>
        ) : (
          <Card className="p-4">
            <ul className="flex flex-col">
              {roster.map((vendor) => (
                <li
                  key={vendor.storeId}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border py-3 first:border-t-0 first:pt-0 last:pb-0"
                >
                  <Badge>Booth {vendor.booth}</Badge>
                  <span className="min-w-0 flex-1 truncate font-medium text-text-primary">
                    {vendor.vendorName}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </section>
    </div>
  );
}
