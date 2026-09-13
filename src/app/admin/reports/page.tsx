import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowLeft,
  CalendarDays,
  Flame,
  Handshake,
  Radio,
  UserRound,
  Users,
} from "lucide-react";

import { StatTile } from "@/components/admin/glance";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select, TextInput } from "@/components/ui/controls";
import { activityReport } from "@/lib/admin/activity";
import { PERIODS, rangeFor } from "@/lib/admin/activity-range";
import { requireAdmin } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: "Reports",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * Activity, counted over a window.
 *
 * The founder's ask, replacing a directory of guest sessions nobody
 * needed: "a counter somewhere of all guests that were in cardflare
 * during a certain period... put in filters such as show me how many
 * guests signed in during a certain time, or how many Flares were
 * posted by guests, players, vendors." A plain form that reloads the
 * page, so a report is a link that can be sent to a cofounder.
 */
export default async function AdminReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; from?: string; to?: string }>;
}) {
  await requireAdmin();

  const range = rangeFor(await searchParams);
  const report = await activityReport(range);

  const dateFormat = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
  const spanLabel = `${dateFormat.format(new Date(range.from))} to ${dateFormat.format(
    new Date(Date.parse(range.to) - 1),
  )}`;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <Link
          href="/admin"
          className="inline-flex w-fit items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Back to the console
        </Link>

        <h2 className="text-xl font-bold text-text-primary">Reports</h2>
        <p className="max-w-2xl text-sm text-text-secondary">
          What happened across every store, counted over a window. Dates are in UTC.
        </p>
      </div>

      <Card>
        <form method="get" className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-sm text-text-secondary">
            Period
            <Select name="period" defaultValue={range.period} className="w-44">
              {PERIODS.map((entry) => (
                <option key={entry.value} value={entry.value}>
                  {entry.label}
                </option>
              ))}
            </Select>
          </label>
          <label className="flex flex-col gap-1 text-sm text-text-secondary">
            From
            <TextInput
              type="date"
              name="from"
              defaultValue={range.fromDate}
              className="w-44"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-text-secondary">
            To
            <TextInput
              type="date"
              name="to"
              defaultValue={range.toDate}
              className="w-44"
            />
          </label>
          <Button type="submit" size="md">
            Show
          </Button>
          <p className="basis-full text-xs text-text-muted">
            The dates only apply with Custom dates selected. Showing {spanLabel}.
          </p>
        </form>
      </Card>

      <section className="flex flex-col gap-4" aria-labelledby="people-heading">
        <h3 id="people-heading" className="text-lg font-bold text-text-primary">
          People
        </h3>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile icon={Users} label="New guests" value={report.guestsNew} />
          <StatTile icon={Users} label="Guests seen" value={report.guestsActive} />
          <StatTile
            icon={UserRound}
            label="Accounts created"
            value={report.accountsNew}
          />
          <StatTile
            icon={CalendarDays}
            label="Seats taken in rooms"
            value={report.roomSeats}
          />
        </div>
        <p className="text-xs text-text-muted">
          A guest is a scan with no account behind it. New guests began in the window;
          guests seen were in a room at any point in it. Seats count one per person per
          room.
        </p>
      </section>

      <section className="flex flex-col gap-4" aria-labelledby="activity-heading">
        <h3 id="activity-heading" className="text-lg font-bold text-text-primary">
          Activity
        </h3>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile
            icon={Radio}
            label="Flares by guests"
            value={report.flaresByGuests}
          />
          <StatTile
            icon={Radio}
            label="Flares by accounts"
            value={report.flaresByAccounts}
          />
          <StatTile icon={Handshake} label="Hands raised" value={report.offers} />
          <StatTile icon={Flame} label="Trades confirmed" value={report.trades} />
        </div>
      </section>

      <section className="flex flex-col gap-4" aria-labelledby="rooms-heading">
        <h3 id="rooms-heading" className="text-lg font-bold text-text-primary">
          Rooms
        </h3>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile
            icon={CalendarDays}
            label="Walk-in rooms opened"
            value={report.roomsWalkIn}
          />
          <StatTile
            icon={CalendarDays}
            label="Events created"
            value={report.roomsScheduled}
          />
        </div>
        <p className="text-xs text-text-muted">
          Stores and vendors do not post Flares; their inventory answers them. Store
          activity lives under Stores &amp; vendors.
        </p>
      </section>
    </div>
  );
}
