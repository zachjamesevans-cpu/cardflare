import Link from "next/link";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Clock,
  Flame,
  HelpCircle,
  Lock,
  Undo2,
} from "lucide-react";

import { Card } from "@/components/ui/card";
import { buttonStyles } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import type { TradeHistoryEntry, TradeHistoryTotals } from "@/lib/trades/history";

/**
 * The pieces of the trade history, shared by the card on the profile
 * and the full page so the two draw a trade the same way.
 *
 * One row is one card and which way it went: "Got Luffy from Kaito",
 * "Gave Zoro to Tyler", the store and the day under it, and the
 * Embers it paid at the end. The founder's problem is a missing page
 * in a binder, so the row leads with the card and the direction.
 */

/** "Fri, Sep 12", in the reader's own clock. A day is enough. */
export function dayOf(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(new Date(iso));
}

/** "September 2026", the group heading. */
export function monthOf(iso: string): string {
  return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(
    new Date(iso),
  );
}

function statusLine(
  trade: TradeHistoryEntry,
): { icon: typeof Clock; text: string } | null {
  switch (trade.status) {
    case "pending":
      return { icon: Clock, text: "Waiting on the other side to confirm" };
    case "late":
      return { icon: Clock, text: "Not confirmed in time" };
    case "disputed":
      return { icon: Undo2, text: "Reversed. Its Embers were taken back." };
    case "unnamed":
      return { icon: HelpCircle, text: "Nobody named, so it earned nothing" };
    default:
      return null;
  }
}

export function TradeHistoryRow({
  trade,
  compact = false,
}: {
  trade: TradeHistoryEntry;
  /** On the profile card: no card number, one line of detail. */
  compact?: boolean;
}) {
  const Icon = trade.got ? ArrowDownLeft : ArrowUpRight;
  const line = statusLine(trade);

  return (
    <li className="flex items-center gap-3 border-t border-border py-3 first:border-t-0 first:pt-0 last:pb-0">
      <span className="block w-11 shrink-0 overflow-hidden rounded-[5px] border border-border bg-elevated">
        <span className="block aspect-[60/84] w-full">
          {trade.imageUrl && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={trade.imageUrl} alt="" className="size-full object-cover" />
          )}
        </span>
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="flex items-start gap-1.5 text-sm text-text-primary">
          <Icon
            className={cn(
              "mt-1 size-3.5 shrink-0",
              trade.got ? "text-accent" : "text-text-muted",
            )}
            aria-hidden="true"
          />
          {/* Two lines rather than an ellipsis: the partner's name is
              the part a puzzled binder owner is looking for. */}
          <span className="line-clamp-2">
            {trade.got ? "Got " : "Gave "}
            <span className="font-semibold">{trade.cardName}</span>
            {trade.quantity > 1 && (
              <span className="text-text-muted tabular-nums"> ×{trade.quantity}</span>
            )}
            {trade.partnerName ? (
              <>
                {trade.got ? " from " : " to "}
                <span className="font-semibold">{trade.partnerName}</span>
              </>
            ) : null}
          </span>
        </p>
        <p className="truncate text-xs text-text-muted">
          {[
            trade.storeName,
            dayOf(trade.confirmedAt),
            compact ? null : trade.cardNumber,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
        {line && !compact && (
          <p className="flex items-center gap-1.5 text-xs text-text-muted">
            <line.icon className="size-3.5" aria-hidden="true" />
            {line.text}
          </p>
        )}
      </div>
      <span
        className={cn(
          "inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold tabular-nums",
          trade.embers > 0
            ? "border-accent/30 bg-accent/10 text-accent"
            : "border-border bg-elevated text-text-muted",
        )}
      >
        <Flame className="size-3" aria-hidden="true" />
        {trade.embers > 0 ? `+${trade.embers}` : trade.embers}
      </span>
    </li>
  );
}

/**
 * What a free player sees instead of rows: the shape of a list with
 * nothing in it, blurred, so the wall reads as covering something.
 * Drawn from nothing - the server sent no rows to hide.
 */
export function LockedRows({ count }: { count: number }) {
  return (
    <ul
      className="pointer-events-none flex flex-col blur-[6px] select-none"
      aria-hidden="true"
    >
      {Array.from({ length: count }, (_, index) => (
        <li
          key={index}
          className="flex items-center gap-3 border-t border-border py-3 first:border-t-0 first:pt-0 last:pb-0"
        >
          <span className="block aspect-[60/84] w-11 shrink-0 rounded-[5px] bg-elevated" />
          <span className="flex min-w-0 flex-1 flex-col gap-1.5">
            <span className="h-3.5 w-3/4 rounded bg-elevated" />
            <span className="h-3 w-1/2 rounded bg-elevated" />
          </span>
          <span className="h-5 w-12 rounded-full bg-elevated" />
        </li>
      ))}
    </ul>
  );
}

/** The Pro pitch over the blurred rows. */
export function TradeHistoryWall({ count }: { count: number }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center p-2">
      <div className="flex w-full max-w-xs flex-col items-center gap-3 rounded-[var(--radius-card)] border border-accent/40 bg-surface/95 p-5 text-center shadow-[var(--shadow-card)]">
        <span className="flex size-10 items-center justify-center rounded-full border border-accent/40 bg-accent/10 text-accent">
          <Lock className="size-5" aria-hidden="true" />
        </span>
        <p className="font-semibold text-text-primary">
          {count === 0
            ? "Your trades will be saved here"
            : count === 1
              ? "Your trade is saved"
              : `Your ${count} trades are saved`}
        </p>
        <p className="text-sm text-text-secondary">
          See every card you got and gave, who it was with, and the Embers it earned,
          with cardflare Pro.
        </p>
        <Link href="/pro" className={buttonStyles("primary", "sm")}>
          Get cardflare Pro
        </Link>
        <p className="text-xs text-text-muted">$7.99 a month</p>
      </div>
    </div>
  );
}

/** Three numbers over the list: trades, got, gave. */
export function TradeHistoryTotalsRow({ totals }: { totals: TradeHistoryTotals }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {[
        [totals.trades, totals.trades === 1 ? "trade" : "trades"],
        [totals.got, "got"],
        [totals.gave, "gave"],
      ].map(([value, label]) => (
        <div
          key={label}
          className="rounded-[var(--radius-control)] border border-border bg-elevated px-3 py-2 text-center"
        >
          <p className="text-lg font-bold text-text-primary tabular-nums">{value}</p>
          <p className="text-xs text-text-secondary">{label}</p>
        </div>
      ))}
    </div>
  );
}

/**
 * The card on the profile, under Embers: three recent trades and the
 * door to the rest. Locked, the card itself is the pitch.
 */
export function TradeHistoryCard({
  locked,
  totals,
  trades,
}: {
  locked: boolean;
  totals: TradeHistoryTotals;
  trades: TradeHistoryEntry[];
}) {
  const recent = trades.slice(0, 3);

  return (
    <Card className="relative flex flex-col gap-4 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <p className="font-semibold text-text-primary">Trade history</p>
          <p className="text-sm text-text-secondary">
            Every card you got and gave, so the binder never surprises you.
          </p>
        </div>
        {locked && (
          <span className="inline-flex items-center gap-1 rounded-full border border-accent/30 bg-accent/10 px-2.5 py-1 text-xs font-semibold text-accent">
            Pro
          </span>
        )}
      </div>

      {locked ? (
        <div className="relative">
          <LockedRows count={3} />
          <div
            className="pointer-events-none mt-4 h-9 rounded-[var(--radius-control)] bg-elevated blur-[6px]"
            aria-hidden="true"
          />
          <TradeHistoryWall count={totals.trades} />
        </div>
      ) : recent.length === 0 ? (
        <p className="text-sm text-text-muted">
          Nothing traded yet. Confirm a trade in a room and it lands here.
        </p>
      ) : (
        <>
          <ul className="flex flex-col">
            {recent.map((trade) => (
              <TradeHistoryRow key={trade.id} trade={trade} compact />
            ))}
          </ul>
          <Link
            href="/profile/trades"
            className={cn(buttonStyles("secondary", "sm"), "w-full justify-center")}
          >
            {totals.trades > recent.length
              ? `See all ${totals.trades} trades`
              : "See your trade history"}
          </Link>
        </>
      )}
    </Card>
  );
}
