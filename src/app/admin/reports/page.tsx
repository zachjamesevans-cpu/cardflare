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
import { embersReport } from "@/lib/admin/embers-report";
import { disputeTradeAction } from "@/lib/admin/embers-actions";
import { SubmitButton } from "@/components/ui/submit-button";
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
  const [report, embers] = await Promise.all([
    activityReport(range),
    embersReport(range),
  ]);

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

      {/* Embers: who earned, from whom, and the shapes that look like
          farming. Every trade row can be disputed, which takes both
          sides' Embers back and stops it counting. */}
      <section className="flex flex-col gap-4" aria-labelledby="embers-heading">
        <h3 id="embers-heading" className="text-lg font-bold text-text-primary">
          Embers
        </h3>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile icon={Flame} label="Embers earned" value={embers.earned} />
          <StatTile icon={Flame} label="Embers reversed" value={embers.reversed} />
          <StatTile
            icon={Handshake}
            label="Pairs trading 3+ times"
            value={embers.busyPairs.length}
          />
          <StatTile
            icon={UserRound}
            label="New accounts earning 20+"
            value={embers.youngEarners.length}
          />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="flex flex-col gap-3">
            <p className="font-semibold text-text-primary">Top earners</p>
            {embers.topEarners.length === 0 ? (
              <p className="text-sm text-text-muted">Nobody earned in this window.</p>
            ) : (
              <ul className="flex flex-col">
                {embers.topEarners.map((row) => (
                  <li
                    key={row.playerId}
                    className="flex items-center justify-between gap-3 border-t border-border py-2 text-sm first:border-t-0 first:pt-0"
                  >
                    <span className="min-w-0 truncate text-text-primary">
                      {row.displayName}
                      {row.handle && (
                        <span className="text-text-muted"> @{row.handle}</span>
                      )}
                      {row.accountAgeDays < 14 && (
                        <span className="ml-2 rounded-full bg-warning/15 px-1.5 py-0.5 text-[10px] font-bold text-warning uppercase">
                          {row.accountAgeDays}d old
                        </span>
                      )}
                    </span>
                    <span className="shrink-0 font-semibold text-text-primary tabular-nums">
                      {row.earned}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="flex flex-col gap-3">
            <p className="font-semibold text-text-primary">
              Pairs trading with each other
            </p>
            {embers.busyPairs.length === 0 ? (
              <p className="text-sm text-text-muted">
                No pair traded three or more times in this window.
              </p>
            ) : (
              <ul className="flex flex-col">
                {embers.busyPairs.map((row) => (
                  <li
                    key={`${row.a.playerId}:${row.b.playerId}`}
                    className="flex items-center justify-between gap-3 border-t border-border py-2 text-sm first:border-t-0 first:pt-0"
                  >
                    <span className="min-w-0 truncate text-text-primary">
                      {row.a.displayName} &amp; {row.b.displayName}
                    </span>
                    <span className="shrink-0 text-text-secondary tabular-nums">
                      {row.trades} trades
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <Card className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <p className="font-semibold text-text-primary">Trades</p>
            <p className="text-xs text-text-muted">
              Newest first. A join gap under a minute means both people entered the room
              within sixty seconds of each other, the shape of one person with two
              phones. Dispute takes both sides&rsquo; Embers back.
            </p>
          </div>
          {embers.recentTrades.length === 0 ? (
            <p className="text-sm text-text-muted">No trades in this window.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-text-muted">
                    <th className="py-1 pr-3 font-medium">When</th>
                    <th className="py-1 pr-3 font-medium">Card</th>
                    <th className="py-1 pr-3 font-medium">Author</th>
                    <th className="py-1 pr-3 font-medium">Partner</th>
                    <th className="py-1 pr-3 font-medium">Status</th>
                    <th className="py-1 pr-3 font-medium">Join gap</th>
                    <th className="py-1 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {embers.recentTrades.map((trade) => {
                    const quick =
                      trade.joinGapSeconds !== null && trade.joinGapSeconds <= 60;
                    return (
                      <tr key={trade.tradeId} className="border-t border-border">
                        <td className="py-2 pr-3 whitespace-nowrap text-text-muted">
                          {dateFormat.format(new Date(trade.confirmedAt))}
                        </td>
                        <td className="py-2 pr-3 text-text-primary">
                          {trade.cardName}
                        </td>
                        <td className="py-2 pr-3 text-text-secondary">
                          {trade.requester.displayName}
                        </td>
                        <td className="py-2 pr-3 text-text-secondary">
                          {trade.holder.displayName}
                        </td>
                        <td className="py-2 pr-3 text-text-secondary">
                          {trade.status}
                        </td>
                        <td
                          className={`py-2 pr-3 tabular-nums ${quick ? "font-semibold text-warning" : "text-text-muted"}`}
                        >
                          {trade.joinGapSeconds === null
                            ? ""
                            : `${Math.round(trade.joinGapSeconds)}s`}
                        </td>
                        <td className="py-2 text-right">
                          {trade.status !== "disputed" &&
                            trade.status !== "unnamed" && (
                              <form action={disputeTradeAction}>
                                <input
                                  type="hidden"
                                  name="tradeId"
                                  value={trade.tradeId}
                                />
                                <SubmitButton
                                  label="Dispute"
                                  pendingLabel="Reversing…"
                                  variant="ghost"
                                  size="sm"
                                />
                              </form>
                            )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </section>
    </div>
  );
}
