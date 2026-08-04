import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { CreateShowForm } from "@/components/shows/create-show-form";
import { Badge, Card } from "@/components/ui/card";
import { requireAdmin } from "@/lib/auth/session";
import { defaultEventWindow, formatEventWindow } from "@/lib/events/format";
import { listShows } from "@/lib/shows/repository";
import { knownTimeZones } from "@/lib/time/zone";

export const metadata: Metadata = {
  title: "Card shows",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/** Every card show, and the form that creates the next one. */
export default async function AdminShowsPage() {
  // The layout guards too. Duplicated deliberately: a layout is not a
  // security boundary on its own.
  await requireAdmin();

  const shows = await listShows();
  const window = defaultEventWindow("UTC");

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-col gap-3">
        <Link
          href="/admin"
          className="inline-flex w-fit items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Back to the console
        </Link>

        <h2 className="text-xl font-bold text-text-primary">Card shows</h2>
        <p className="max-w-2xl text-sm text-text-secondary">
          One code per show. Vendors claim booths from their dashboard; attendees scan
          and search.
        </p>
      </div>

      <section className="flex flex-col gap-5" aria-labelledby="new-show-heading">
        <h3 id="new-show-heading" className="text-lg font-bold text-text-primary">
          New show
        </h3>

        <Card>
          <CreateShowForm
            zones={knownTimeZones("UTC")}
            defaultZone="UTC"
            defaultStartsAt={window.startsAt}
            defaultEndsAt={window.endsAt}
          />
        </Card>
      </section>

      <section className="flex flex-col gap-5" aria-labelledby="shows-heading">
        <div className="flex items-center justify-between gap-4">
          <h3 id="shows-heading" className="text-lg font-bold text-text-primary">
            All shows
          </h3>
          <span className="text-sm text-text-muted tabular-nums">
            {shows.length} total
          </span>
        </div>

        {shows.length === 0 ? (
          <Card className="py-10 text-center text-text-secondary">
            No shows yet. Create the first one above.
          </Card>
        ) : (
          <Card className="p-4">
            <ul className="flex flex-col">
              {shows.map((show) => (
                <li
                  key={show.id}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border py-3 first:border-t-0 first:pt-0 last:pb-0"
                >
                  <div className="flex min-w-0 flex-1 basis-48 flex-col">
                    <Link
                      href={`/admin/shows/${show.id}`}
                      className="truncate font-semibold text-text-primary underline-offset-4 hover:underline"
                    >
                      {show.name}
                    </Link>
                    <span className="text-xs text-text-muted">
                      {formatEventWindow(show.starts_at, show.ends_at, show.timezone)}
                    </span>
                  </div>
                  <Badge tone="neutral">{show.join_code}</Badge>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </section>
    </div>
  );
}
