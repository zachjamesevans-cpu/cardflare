import Link from "next/link";
import {
  Ban,
  DoorOpen,
  Flag,
  Flame,
  Handshake,
  Image,
  MessageCircle,
  ShieldAlert,
  Sparkles,
  Target,
  type LucideIcon,
} from "lucide-react";

import { Card } from "@/components/ui/card";
import type {
  ActivityItem,
  ActivityKind,
  PlayerTimeline,
} from "@/lib/admin/player-timeline";
import { ago } from "@/lib/notifications/inbox-row";

/**
 * One player's activity, for the admin handling a support question or
 * a dispute. The audit of 2026-10-01: "a per-player activity timeline
 * in admin (last seen, Flares, trades, rooms)".
 *
 * Three parts, top to bottom: the facts an admin reaches for first
 * (address, tier, when they joined, when they were last in a room,
 * their Embers), the counts, and then everything they did, newest
 * first. A Server Component: there is nothing here to click except
 * links, and the page that hosts it already did the reading.
 */

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** "1 Oct 2026": built by hand so the server and the browser agree. */
function shortDate(iso: string): string {
  const date = new Date(iso);
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

const ICONS: Record<ActivityKind, LucideIcon> = {
  room: DoorOpen,
  flare: Flame,
  post: Image,
  hunt: Target,
  trade: Handshake,
  message: MessageCircle,
  "report-filed": Flag,
  "report-received": ShieldAlert,
  block: Ban,
  embers: Sparkles,
  offer: Handshake,
  logged: Handshake,
};

export function PlayerActivity({ timeline }: { timeline: PlayerTimeline }) {
  const { player, counts, items } = timeline;

  const facts: [string, string][] = [
    ["Email", player.email ?? "No address on file"],
    ["Tier", player.tier],
    ["Joined", shortDate(player.createdAt)],
    [
      "Last in a room",
      player.lastActiveAt ? `${ago(player.lastActiveAt)} ago` : "never",
    ],
    ["Embers badge", player.embersBadge.toLocaleString()],
    ["Embers to spend", player.embersBalance.toLocaleString()],
  ];

  const chips: [string, number][] = [
    ["rooms", counts.rooms],
    ["Flares", counts.flares],
    ["Flare rows, all time", counts.flareRows],
    ["posts", counts.posts],
    ["hunts", counts.hunts],
    ["trades", counts.trades],
    ["messages", counts.messages],
    ["reports filed", counts.reportsFiled],
    ["reports received", counts.reportsReceived],
    ["blocks", counts.blocks],
  ];

  return (
    <div className="flex flex-col gap-6">
      <Card className="flex flex-col gap-4">
        <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
          {facts.map(([label, value]) => (
            <div key={label} className="flex min-w-0 flex-col">
              <dt className="text-xs text-text-muted">{label}</dt>
              <dd className="truncate text-sm text-text-primary tabular-nums">
                {value}
              </dd>
            </div>
          ))}
        </dl>
        <Link
          href={`/p/${player.id}`}
          className="w-fit text-sm font-semibold text-accent hover:underline"
        >
          Open profile
        </Link>
      </Card>

      <ul className="flex flex-wrap gap-2" aria-label="Counts">
        {chips.map(([label, value]) => (
          <li
            key={label}
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-elevated px-3 py-1 text-xs text-text-secondary"
          >
            <span className="font-semibold text-text-primary tabular-nums">
              {value.toLocaleString()}
            </span>
            {label}
          </li>
        ))}
      </ul>

      <section className="flex flex-col gap-3" aria-labelledby="activity-heading">
        <h3 id="activity-heading" className="text-lg font-bold text-text-primary">
          Activity
        </h3>
        <Card className="p-4">
          {items.length === 0 ? (
            <p className="text-sm text-text-muted">Nothing yet.</p>
          ) : (
            <ul className="flex flex-col">
              {items.map((item, index) => (
                <ActivityRow key={`${item.kind}:${item.at}:${index}`} item={item} />
              ))}
            </ul>
          )}
        </Card>
      </section>
    </div>
  );
}

function ActivityRow({ item }: { item: ActivityItem }) {
  const Icon = ICONS[item.kind];

  return (
    <li className="flex items-start gap-3 border-t border-border py-2.5 first:border-t-0 first:pt-0 last:pb-0">
      <span className="w-10 shrink-0 pt-0.5 font-mono text-xs text-text-muted tabular-nums">
        {ago(item.at)}
      </span>
      <Icon className="mt-0.5 size-4 shrink-0 text-text-secondary" aria-hidden="true" />
      <span className="min-w-0 flex-1 text-sm text-text-primary">{item.text}</span>
      {item.href && (
        <Link
          href={item.href}
          className="shrink-0 text-xs font-semibold text-accent hover:underline"
        >
          Open
        </Link>
      )}
    </li>
  );
}
