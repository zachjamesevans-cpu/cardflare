import "server-only";

import { avatarSrc } from "@/lib/players/profile-image";
import { emailForPlayer } from "@/lib/players/accounts";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";

/**
 * One player's activity, for the admin handling a support question or
 * a dispute. The audit of 2026-10-01: "a per-player activity timeline
 * in admin (last seen, Flares, trades, rooms)". Read-only, and read
 * from the tables that already exist: nothing is logged for this page
 * that was not logged for the product.
 */

export type ActivityKind =
  | "room"
  | "flare"
  | "post"
  | "hunt"
  | "trade"
  | "message"
  | "report-filed"
  | "report-received"
  | "block"
  | "embers";

export interface ActivityItem {
  kind: ActivityKind;
  at: string;
  text: string;
  /** Somewhere to look, when there is one. */
  href: string | null;
}

export interface PlayerTimeline {
  player: {
    id: string;
    displayName: string;
    handle: string;
    avatarUrl: string | null;
    email: string | null;
    tier: string;
    createdAt: string;
    /** Last seen in a room, or null. */
    lastActiveAt: string | null;
    embersBadge: number;
    embersBalance: number;
  };
  counts: {
    rooms: number;
    flares: number;
    posts: number;
    hunts: number;
    trades: number;
    messages: number;
    reportsFiled: number;
    reportsReceived: number;
    blocks: number;
  };
  /** Newest first, capped. */
  items: ActivityItem[];
}

const ITEM_CAP = 80;
const PER_SOURCE = 40;

export async function playerTimeline(playerId: string): Promise<PlayerTimeline | null> {
  if (!isSupabaseConfigured()) return null;
  const admin = getSupabaseAdmin();

  const { data: player } = await admin
    .from("players")
    .select("*")
    .eq("id", playerId)
    .maybeSingle();
  if (!player) return null;

  const { data: sessions } = await admin
    .from("player_sessions")
    .select("id, last_seen_at")
    .eq("player_id", playerId);
  const sessionIds = (sessions ?? []).map((row) => row.id);
  const sessionList = sessionIds.map((id) => `"${id}"`).join(",");
  const lastActiveAt =
    (sessions ?? [])
      .map((row) => row.last_seen_at)
      .sort()
      .at(-1) ?? null;

  const [
    email,
    rooms,
    flares,
    posts,
    hunts,
    trades,
    messageCount,
    recentMessages,
    reportsFiled,
    reportsReceived,
    blocks,
    ledger,
  ] = await Promise.all([
    emailForPlayer(playerId),
    sessionIds.length > 0
      ? admin
          .from("event_participants")
          .select("event_id, joined_at", { count: "exact" })
          .in("player_session_id", sessionIds)
          .order("joined_at", { ascending: false })
          .limit(PER_SOURCE)
      : Promise.resolve({
          data: [] as { event_id: string; joined_at: string }[],
          count: 0,
        }),
    admin
      .from("flares")
      .select("id, created_at, card_id, intent, status, event_id", { count: "exact" })
      .or(
        [
          `player_id.eq.${playerId}`,
          ...(sessionIds.length > 0 ? [`player_session_id.in.(${sessionList})`] : []),
        ].join(","),
      )
      .order("created_at", { ascending: false })
      .limit(PER_SOURCE),
    admin
      .from("flare_posts")
      .select("id, created_at, intent, caption", { count: "exact" })
      .or(
        [
          `player_id.eq.${playerId}`,
          ...(sessionIds.length > 0 ? [`player_session_id.in.(${sessionList})`] : []),
        ].join(","),
      )
      .order("created_at", { ascending: false })
      .limit(PER_SOURCE),
    admin
      .from("hunts")
      .select("id, created_at, name", { count: "exact" })
      .eq("player_id", playerId)
      .order("created_at", { ascending: false })
      .limit(PER_SOURCE),
    admin
      .from("trades")
      .select(
        "id, confirmed_at, card_id, thread_id, event_id, acknowledged_at, paid_at, disputed_at",
        { count: "exact" },
      )
      .or(
        [
          `requester_player_id.eq.${playerId}`,
          `holder_player_id.eq.${playerId}`,
          ...(sessionIds.length > 0
            ? [
                `requester_session_id.in.(${sessionList})`,
                `holder_session_id.in.(${sessionList})`,
              ]
            : []),
        ].join(","),
      )
      .order("confirmed_at", { ascending: false })
      .limit(PER_SOURCE),
    admin
      .from("flare_messages")
      .select("id", { count: "exact", head: true })
      .eq("sender_player_id", playerId),
    admin
      .from("flare_messages")
      .select("id, created_at, thread_id")
      .eq("sender_player_id", playerId)
      .order("created_at", { ascending: false })
      .limit(10),
    admin
      .from("player_reports")
      .select("id, created_at, target_kind, reason, status", { count: "exact" })
      .eq("reporter_id", playerId)
      .order("created_at", { ascending: false })
      .limit(PER_SOURCE),
    admin
      .from("player_reports")
      .select("id, created_at, target_kind, reason, status", { count: "exact" })
      .eq("target_player_id", playerId)
      .order("created_at", { ascending: false })
      .limit(PER_SOURCE),
    admin
      .from("player_blocks")
      .select("blocked_id, created_at", { count: "exact" })
      .eq("blocker_id", playerId)
      .order("created_at", { ascending: false })
      .limit(PER_SOURCE),
    admin
      .from("ember_ledger")
      .select("created_at, reason, earned_delta, balance_delta, note")
      .eq("player_id", playerId)
      .order("created_at", { ascending: false })
      .limit(PER_SOURCE),
  ]);

  /* Names for the ids the rows carry: cards, rooms and their stores. */
  const cardIds = [
    ...new Set([
      ...(flares.data ?? []).map((row) => row.card_id),
      ...(trades.data ?? []).map((row) => row.card_id),
    ]),
  ];
  const eventIds = [
    ...new Set([
      ...(rooms.data ?? []).map((row) => row.event_id),
      ...(flares.data ?? []).flatMap((row) => (row.event_id ? [row.event_id] : [])),
      ...(trades.data ?? []).flatMap((row) => (row.event_id ? [row.event_id] : [])),
    ]),
  ];

  const [cards, events] = await Promise.all([
    cardIds.length > 0
      ? admin.from("cards").select("id, exact_name").in("id", cardIds)
      : Promise.resolve({ data: [] as { id: string; exact_name: string }[] }),
    eventIds.length > 0
      ? admin.from("events").select("id, name, join_code, store_id").in("id", eventIds)
      : Promise.resolve({
          data: [] as {
            id: string;
            name: string;
            join_code: string;
            store_id: string;
          }[],
        }),
  ]);
  const storeIds = [...new Set((events.data ?? []).map((row) => row.store_id))];
  const stores =
    storeIds.length > 0
      ? await admin.from("stores").select("id, name").in("id", storeIds)
      : { data: [] as { id: string; name: string }[] };

  const cardName = new Map((cards.data ?? []).map((row) => [row.id, row.exact_name]));
  const eventById = new Map((events.data ?? []).map((row) => [row.id, row]));
  const storeName = new Map((stores.data ?? []).map((row) => [row.id, row.name]));
  const roomLabel = (eventId: string | null) => {
    const event = eventId ? eventById.get(eventId) : null;
    if (!event) return null;
    const store = storeName.get(event.store_id);
    return store ? `${event.name} at ${store}` : event.name;
  };
  const roomHref = (eventId: string | null) => {
    const event = eventId ? eventById.get(eventId) : null;
    return event ? `/e/${event.join_code}` : null;
  };

  const items: ActivityItem[] = [
    ...(rooms.data ?? []).map((row) => ({
      kind: "room" as const,
      at: row.joined_at,
      text: `Joined ${roomLabel(row.event_id) ?? "a room"}`,
      href: roomHref(row.event_id),
    })),
    ...(flares.data ?? []).map((row) => ({
      kind: "flare" as const,
      at: row.created_at,
      text: `${row.intent === "showcase" ? "Let go of" : "Looked for"} ${
        cardName.get(row.card_id) ?? "a card"
      }${row.event_id ? ` in ${roomLabel(row.event_id) ?? "a room"}` : " nearby"}${
        row.status === "traded"
          ? ", traded"
          : row.status === "open"
            ? ""
            : `, ${row.status}`
      }`,
      href: roomHref(row.event_id),
    })),
    ...(posts.data ?? []).map((row) => ({
      kind: "post" as const,
      at: row.created_at,
      text: `Posted ${row.intent === "showcase" ? "a showcase" : "a Flare"}${
        row.caption ? `: “${row.caption}”` : ""
      }`,
      href: null,
    })),
    ...(hunts.data ?? []).map((row) => ({
      kind: "hunt" as const,
      at: row.created_at,
      text: `Started the hunt “${row.name}”`,
      href: null,
    })),
    ...(trades.data ?? []).map((row) => ({
      kind: "trade" as const,
      at: row.confirmed_at,
      text: `Traded ${cardName.get(row.card_id) ?? "a card"} ${
        row.thread_id
          ? "in a conversation"
          : `in ${roomLabel(row.event_id) ?? "a room"}`
      }${
        row.disputed_at
          ? ", reversed"
          : row.acknowledged_at
            ? ", both confirmed"
            : row.paid_at
              ? ", not confirmed in time"
              : ", waiting on the other side"
      }`,
      href: roomHref(row.event_id),
    })),
    ...(recentMessages.data ?? []).map((row) => ({
      kind: "message" as const,
      at: row.created_at,
      text: "Sent a message",
      href: null,
    })),
    ...(reportsFiled.data ?? []).map((row) => ({
      kind: "report-filed" as const,
      at: row.created_at,
      text: `Reported a ${row.target_kind} for ${row.reason}${
        row.status === "resolved" ? ", resolved" : ", open"
      }`,
      href: "/admin/reports",
    })),
    ...(reportsReceived.data ?? []).map((row) => ({
      kind: "report-received" as const,
      at: row.created_at,
      text: `Was reported (${row.target_kind}, ${row.reason})${
        row.status === "resolved" ? ", resolved" : ", open"
      }`,
      href: "/admin/reports",
    })),
    ...(blocks.data ?? []).map((row) => ({
      kind: "block" as const,
      at: row.created_at,
      text: "Blocked a player",
      href: `/admin/players/${row.blocked_id}`,
    })),
    ...(ledger.data ?? []).map((row) => ({
      kind: "embers" as const,
      at: row.created_at,
      text: `${row.balance_delta >= 0 ? "+" : ""}${row.balance_delta} Embers, ${row.reason}${
        row.note ? `: ${row.note}` : ""
      }`,
      href: null,
    })),
  ]
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, ITEM_CAP);

  return {
    player: {
      id: player.id,
      displayName: player.display_name,
      handle: player.handle ?? "",
      avatarUrl: avatarSrc(player.avatar_url),
      email,
      tier: player.tier,
      createdAt: player.created_at,
      lastActiveAt,
      embersBadge: player.embers_badge ?? player.embers_earned,
      embersBalance: player.embers_balance,
    },
    counts: {
      rooms: rooms.count ?? 0,
      flares: flares.count ?? 0,
      posts: posts.count ?? 0,
      hunts: hunts.count ?? 0,
      trades: trades.count ?? 0,
      messages: messageCount.count ?? 0,
      reportsFiled: reportsFiled.count ?? 0,
      reportsReceived: reportsReceived.count ?? 0,
      blocks: blocks.count ?? 0,
    },
    items,
  };
}
