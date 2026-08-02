import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";

import { EventStatusControls } from "@/components/events/event-status-controls";
import { JoinPoster } from "@/components/events/join-poster";
import { AppShell } from "@/components/layout/app-shell";
import { Badge, Card } from "@/components/ui/card";
import { getViewer } from "@/lib/auth/session";
import { formatEventWindow } from "@/lib/events/format";
import { joinQrSvg, joinUrl } from "@/lib/events/qr";
import { findEventById } from "@/lib/events/repository";
import { STATUS_LABELS } from "@/lib/events/schema";

export const metadata: Metadata = {
  title: "Event",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function EventPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const viewer = await getViewer();

  if (viewer.kind === "anonymous") redirect(`/login?next=/store/events/${id}`);

  const event = await findEventById(id);

  /*
   * A missing event and someone else's event produce the same 404.
   * Distinguishing them would let any signed-in store confirm which event ids
   * exist by walking them.
   */
  if (!event) notFound();

  const canView =
    viewer.kind === "admin" ||
    (viewer.kind === "store" && viewer.storeIds.includes(event.store_id));

  if (!canView) notFound();

  const [svg] = await Promise.all([joinQrSvg(event.join_code)]);

  return (
    <AppShell
      area="Store"
      email={viewer.user.email ?? ""}
      title={event.name}
      description={formatEventWindow(event.starts_at, event.ends_at)}
    >
      <div className="flex flex-wrap items-center gap-3">
        <Badge tone={event.status === "open" ? "accent" : "neutral"}>
          {STATUS_LABELS[event.status]}
        </Badge>
        <Link
          href={viewer.kind === "admin" ? "/admin" : "/store"}
          className="text-sm text-text-muted underline underline-offset-4 hover:text-text-secondary"
        >
          Back to all events
        </Link>
      </div>

      <section className="flex flex-col gap-5" aria-labelledby="status-heading">
        <h2 id="status-heading" className="text-xl font-bold text-text-primary">
          Event status
        </h2>
        <Card>
          <EventStatusControls eventId={event.id} status={event.status} />
        </Card>
      </section>

      <section className="flex flex-col gap-5" aria-labelledby="qr-heading">
        <h2 id="qr-heading" className="text-xl font-bold text-text-primary">
          Join code
        </h2>
        <JoinPoster
          eventName={event.name}
          eventWindow={formatEventWindow(event.starts_at, event.ends_at)}
          joinCode={event.join_code}
          url={joinUrl(event.join_code)}
          qrSvg={svg}
        />
      </section>
    </AppShell>
  );
}
