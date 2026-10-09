"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Clock,
  Flame,
  HelpCircle,
  Lock,
  PenLine,
  Trash2,
  Undo2,
} from "lucide-react";

import { FlareHistoryRow } from "@/components/trades/flare-history-row";
import { ProMark } from "@/components/stores/ultra-mark";
import { Card } from "@/components/ui/card";
import { buttonStyles } from "@/components/ui/button";
import { QuantityBadge } from "@/components/ui/quantity-badge";
import { formatLocalDate, LocalDate, useMounted } from "@/components/ui/local-date";
import { DotsMenu } from "@/components/ui/menu";
import { cn } from "@/lib/cn";
import { deleteLoggedTradeAction } from "@/lib/trades/logged-actions";
import type { FlareHistoryEntry } from "@/lib/flares/history";
import type { TradeHistoryEntry, TradeHistoryTotals } from "@/lib/trades/history";

/**
 * The pieces of History, shared by the profile's Trades pane and the
 * full page so the two draw a trade the same way.
 *
 * One row is one card and which way it went: "Got Luffy from Kaito",
 * "Gave Zoro to Tyler", the store and the day under it, and the
 * Embers it paid at the end. The founder's problem is a missing page
 * in a binder, so the row leads with the card and the direction.
 *
 * Two sources, one list. A trade confirmed in a room is the room's
 * word; a trade the player logged themselves says "Logged by you",
 * earned nothing, and is the only kind with a menu, because it is the
 * only kind they may take back.
 */

/**
 * "Fri, Sep 12", in the reader's own clock. A day is enough.
 *
 * Drawn through `LocalDate`, never on the server: the audit of
 * 2026-10-01 caught "Sun, Aug 9" from the server and "Sat, Aug 8" after
 * hydration, because the server's clock is UTC and the reader's is
 * not. The helper stays for anything that already has a clock to ask.
 */
export function dayOf(iso: string, timeZone?: string): string {
  return formatLocalDate(iso, "day", timeZone);
}

/** "September 2026", the group heading. */
export function monthOf(iso: string, timeZone?: string): string {
  return formatLocalDate(iso, "month", timeZone);
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
    case "logged":
      return { icon: PenLine, text: "Logged by you" };
    default:
      return null;
  }
}

export function TradeHistoryRow({
  trade,
  compact = false,
}: {
  trade: TradeHistoryEntry;
  /** On the profile card: no card number, one line of detail, no menu. */
  compact?: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  /* Two taps to take a trade back: the menu's Remove turns into a
     question on the row, and only its Remove answers it. */
  const [confirming, setConfirming] = useState(false);
  const [pending, start] = useTransition();
  const Icon = trade.got ? ArrowDownLeft : ArrowUpRight;
  const line = statusLine(trade);
  const logged = trade.source === "logged";

  const remove = () => {
    if (pending) return;
    setError(null);
    start(async () => {
      const result = await deleteLoggedTradeAction(trade.id);
      if (!result.ok) {
        setError(result.message);
        setConfirming(false);
        return;
      }
      router.refresh();
    });
  };

  /* The partner opens their profile when the trade names an account. */
  const partner = trade.partnerName ? (
    trade.partnerPlayerId ? (
      <Link
        href={`/p/${trade.partnerPlayerId}`}
        className="font-semibold underline-offset-4 hover:underline"
      >
        {trade.partnerName}
      </Link>
    ) : (
      <span className="font-semibold">{trade.partnerName}</span>
    )
  ) : null;

  return (
    <li
      className={cn(
        "flex flex-wrap items-center gap-3 border-t border-border py-3 first:border-t-0 first:pt-0 last:pb-0",
        pending && "opacity-55",
      )}
    >
      <span className="relative block w-11 shrink-0 overflow-hidden rounded-[5px] border border-border bg-elevated">
        <span className="block aspect-[60/84] w-full">
          {trade.imageUrl && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={trade.imageUrl} alt="" className="size-full object-cover" />
          )}
        </span>
        {/* How many changed hands: the binder's tag, on the card's
            corner, rather than a "×2" in the middle of the sentence. */}
        <QuantityBadge
          quantity={trade.quantity}
          className="pointer-events-none absolute top-0.5 left-0.5"
        />
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
            {trade.quantity > 1 && <span className="sr-only"> ×{trade.quantity}</span>}
            {partner ? (
              <>
                {trade.got ? " from " : " to "}
                {partner}
              </>
            ) : null}
          </span>
        </p>
        {/* The place and the day, in the reader's clock. The card number
            only where there is room: on a phone it ate the day. A trade
            confirmed in a conversation has no store, so it says where it
            was confirmed instead. */}
        <p className="truncate text-xs text-text-muted">
          {trade.source === "conversation" ? (
            <>
              In a conversation
              <span aria-hidden="true"> · </span>
            </>
          ) : (
            trade.storeName && (
              <>
                {trade.storeName}
                <span aria-hidden="true"> · </span>
              </>
            )
          )}
          <LocalDate iso={trade.confirmedAt} format="day" />
          {!compact && trade.cardNumber && (
            <span className="hidden sm:inline">
              <span aria-hidden="true"> · </span>
              {trade.cardNumber}
            </span>
          )}
        </p>
        {/* A logged row says so even on the profile card: the word is
            short, and it is the one thing that separates the player's
            own word from the room's. */}
        {line && (!compact || logged) && (
          <p className="flex items-center gap-1.5 text-xs text-text-muted">
            <line.icon className="size-3.5" aria-hidden="true" />
            {line.text}
          </p>
        )}
        {logged && trade.note && !compact && (
          <p className="text-xs text-text-secondary">{trade.note}</p>
        )}
        {error && (
          <p role="alert" className="text-xs text-danger">
            {error}
          </p>
        )}
      </div>
      {/* A logged trade never paid anything, and a pill saying "0" on
          every one of them reads as a mark against it. Room trades keep
          theirs, zero included: there a zero means something. */}
      {!logged && (
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
      )}
      {/* Only a logged trade can be taken back: a room trade is two
          people's word, and this page is one of them. */}
      {logged &&
        !compact &&
        (confirming ? (
          /* Its own line under the row: beside the name it squeezed the
             card down to a letter at phone width. */
          <span className="flex basis-full items-center justify-end gap-x-2 text-xs text-text-secondary">
            <span>Remove this trade?</span>
            <button
              type="button"
              onClick={remove}
              disabled={pending}
              className="cursor-pointer font-bold text-danger hover:underline disabled:cursor-wait"
            >
              Remove
            </button>
            <span aria-hidden="true">/</span>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              disabled={pending}
              className="cursor-pointer font-semibold text-text-secondary hover:text-text-primary"
            >
              Keep
            </button>
          </span>
        ) : (
          <DotsMenu
            label={`More about ${trade.cardName}`}
            items={[
              {
                key: "remove",
                label: "Remove",
                icon: <Trash2 />,
                onSelect: () => setConfirming(true),
              },
            ]}
          />
        ))}
    </li>
  );
}

/** What History shows: everything, the trades, or the past Flares. */
export type HistoryFilter = "all" | "trades" | "flares";

const FILTERS: { key: HistoryFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "trades", label: "Trades" },
  { key: "flares", label: "Flares" },
];

type HistoryItem =
  | { kind: "trade"; at: string; trade: TradeHistoryEntry }
  | { kind: "flare"; at: string; flare: FlareHistoryEntry };

/**
 * History: the trades and the past Flares, three chips over one card
 * per month, newest first. All merges the two by date. The trade rows
 * are Pro exactly as they were: locked, the server sent none, and the
 * blurred stand-in and the pitch take their place. The Flare rows are
 * free, a player's own log of their own posts. The app's History draws
 * the same chips in the same order.
 */
export function HistoryList({
  locked,
  totals,
  trades,
  flares,
}: {
  locked: boolean;
  totals: TradeHistoryTotals;
  trades: TradeHistoryEntry[];
  flares: FlareHistoryEntry[];
}) {
  const [filter, setFilter] = useState<HistoryFilter>("all");
  const mounted = useMounted();

  const showTrades = filter !== "flares";
  const showFlares = filter !== "trades";

  const items: HistoryItem[] = [
    ...(showTrades && !locked
      ? trades.map((trade) => ({
          kind: "trade" as const,
          at: trade.confirmedAt,
          trade,
        }))
      : []),
    ...(showFlares
      ? flares.map((flare) => ({ kind: "flare" as const, at: flare.endedAt, flare }))
      : []),
  ].sort((a, b) => b.at.localeCompare(a.at));

  /*
   * One card per month, so a year of Fridays reads as a calendar.
   *
   * Grouped in the reader's clock once there is one. The server and
   * the hydration pass group by UTC, which is the same answer for all
   * but an entry in the last hours of a month, and draw the heading
   * blank; the first browser render regroups and writes it. Grouping
   * on the server by the reader's zone is not possible, and grouping
   * by UTC and labelling locally would file an entry under the wrong
   * heading, which is the bug this replaces.
   */
  const months: { label: string; items: HistoryItem[] }[] = [];
  for (const item of items) {
    const label = monthOf(item.at, mounted ? undefined : "UTC");
    const last = months[months.length - 1];
    if (last && last.label === label) last.items.push(item);
    else months.push({ label, items: [item] });
  }

  const empty =
    filter === "trades"
      ? {
          title: "Nothing traded yet",
          body: "Confirm a trade in a room, or log one you made elsewhere, and it lands here.",
        }
      : filter === "flares"
        ? {
            title: "No past Flares yet",
            body: "A Flare lands here once it is found, traded or taken down.",
          }
        : {
            title: "Nothing here yet",
            body: "Your trades, and your Flares once they are found, traded or taken down, land here.",
          };

  return (
    <div className="flex flex-col gap-5">
      <div
        role="radiogroup"
        aria-label="What to show"
        className="flex flex-wrap items-center gap-2"
      >
        {FILTERS.map((option) => (
          <button
            key={option.key}
            type="button"
            role="radio"
            aria-checked={filter === option.key}
            onClick={() => setFilter(option.key)}
            className={cn(
              "cursor-pointer rounded-full border px-3 py-1 text-sm font-semibold transition-colors",
              filter === option.key
                ? "border-accent bg-accent text-accent-contrast"
                : "border-border-strong text-text-secondary hover:text-text-primary",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>

      {showTrades && <TradeHistoryTotalsRow totals={totals} />}

      {/* Pro gating, unchanged: no trade rows were sent to hide. */}
      {showTrades && locked && (
        <div className="relative">
          <Card className="p-4">
            <LockedRows count={6} />
          </Card>
          <TradeHistoryWall count={totals.trades} />
        </div>
      )}

      {months.length === 0
        ? /* Locked, the wall above already says what is not here. */
          !(locked && showTrades) && (
            <Card className="flex flex-col gap-1">
              <p className="font-semibold text-text-primary">{empty.title}</p>
              <p className="text-sm text-text-secondary">{empty.body}</p>
            </Card>
          )
        : months.map((month) => (
            <Card key={month.label} className="flex flex-col gap-3 p-4">
              <p className="text-xs font-medium tracking-wide text-text-muted uppercase">
                <LocalDate iso={month.items[0].at} format="month" />
              </p>
              <ul className="flex flex-col">
                {month.items.map((item) =>
                  item.kind === "trade" ? (
                    <TradeHistoryRow
                      key={`trade-${item.trade.id}`}
                      trade={item.trade}
                    />
                  ) : (
                    <FlareHistoryRow
                      key={`flare-${item.flare.flareId}`}
                      flare={item.flare}
                    />
                  ),
                )}
              </ul>
            </Card>
          ))}
    </div>
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
          with cardflare <ProMark />.
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
          <p className="font-semibold text-text-primary">History</p>
          <p className="text-sm text-text-secondary">
            Every card you got and gave, so the binder never surprises you.
          </p>
        </div>
        {locked && (
          <span className="inline-flex items-center gap-1 rounded-full border border-accent/30 bg-accent/10 px-2.5 py-1 text-xs">
            <ProMark />
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
              : "See your history"}
          </Link>
        </>
      )}
    </Card>
  );
}
