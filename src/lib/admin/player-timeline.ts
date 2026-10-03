import "server-only";

import { avatarSrc } from "@/lib/players/profile-image";
import { emailForPlayer } from "@/lib/players/accounts";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";
import { profileStats } from "@/lib/players/stats";

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
  | "embers"
  | "offer"
  | "logged";

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
    /** Last seen in a room: the newest seat's last_seen_at, or null. */
    lastActiveAt: string | null;
    embersBadge: number;
    embersBalance: number;
  };
  counts: {
    rooms: number;
    /** Open Flares, wants and offerings: the profile's number. */
    flares: number;
    /** Every Flare row ever written, room copies and taken-down ones included. */
    flareRows: number;
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
    offers,
    logged,
    openFlares,
    seats,
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
      .select(
        "id, created_at, updated_at, card_id, intent, status, event_id, found_quantity",
        { count: "exact" },
      )
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
    /* Offers the player made on other people's Flares. The second
       audit: "no offers (you offered on Soupie's cards)". */
    sessionIds.length > 0
      ? admin
          .from("flare_responses")
          .select("id, created_at, flare_id, quantity")
          .in("responder_session_id", sessionIds)
          .order("created_at", { ascending: false })
          .limit(PER_SOURCE)
      : Promise.resolve({
          data: [] as {
            id: string;
            created_at: string;
            flare_id: string;
            quantity: number;
          }[],
        }),
    /* Trades written down by hand, off CardFlare. */
    admin
      .from("logged_trades")
      .select(
        "id, created_at, card_id, direction, partner_name, partner_player_id, traded_on",
      )
      .eq("player_id", playerId)
      .order("traded_on", { ascending: false })
      .limit(PER_SOURCE),
    /* The profile's own number: open wants plus offerings. */
    profileStats(playerId),
    /* "Last in a room" is a seat's clock, not a session's: a session's
       last_seen_at moves on every page, so it read 19h ago right after
       the player posted into a night. */
    sessionIds.length > 0
      ? admin
          .from("event_participants")
          .select("last_seen_at, joined_at")
          .in("player_session_id", sessionIds)
          .order("last_seen_at", { ascending: false })
          .limit(1)
      : Promise.resolve({ data: [] as { last_seen_at: string; joined_at: string }[] }),
  ]);
  const lastActiveAt = seats.data?.[0]?.last_seen_at ?? null;
  /* The Flares behind the offers, for a card name and a room. */
  const offerFlareIds = [...new Set((offers.data ?? []).map((row) => row.flare_id))];
  const { data: offerFlares } =
    offerFlareIds.length > 0
      ? await admin
          .from("flares")
          .select("id, card_id, event_id")
          .in("id", offerFlareIds)
      : { data: [] as { id: string; card_id: string; event_id: string | null }[] };
  const offerFlareById = new Map((offerFlares ?? []).map((row) => [row.id, row]));
  const partnerIds = [
    ...new Set(
      (logged.data ?? []).flatMap((row) =>
        row.partner_player_id ? [row.partner_player_id] : [],
      ),
    ),
  ];
  const { data: partners } =
    partnerIds.length > 0
      ? await admin.from("players").select("id, display_name").in("id", partnerIds)
      : { data: [] as { id: string; display_name: string }[] };
  const partnerName = new Map(
    (partners ?? []).map((row) => [row.id, row.display_name]),
  );

  /* Names for the ids the rows carry: cards, rooms and their stores. */
  const cardIds = [
    ...new Set([
      ...(flares.data ?? []).map((row) => row.card_id),
      ...(trades.data ?? []).map((row) => row.card_id),
      ...(offerFlares ?? []).map((row) => row.card_id),
      ...(logged.data ?? []).map((row) => row.card_id),
    ]),
  ];
  const eventIds = [
    ...new Set([
      ...(rooms.data ?? []).map((row) => row.event_id),
      ...(flares.data ?? []).flatMap((row) => (row.event_id ? [row.event_id] : [])),
      ...(trades.data ?? []).flatMap((row) => (row.event_id ? [row.event_id] : [])),
      ...(offerFlares ?? []).flatMap((row) => (row.event_id ? [row.event_id] : [])),
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
    /* A Flare that came down, and one found: the second audit, "no
       take-down entry, no found updates". The posting row above keeps
       its own line, at its own time. */
    ...(flares.data ?? []).flatMap((row) => {
      const name = cardName.get(row.card_id) ?? "a card";
      const out: ActivityItem[] = [];
      if (row.status === "cancelled" && row.updated_at !== row.created_at) {
        out.push({
          kind: "flare" as const,
          at: row.updated_at,
          text: `Took down ${name}`,
          href: roomHref(row.event_id),
        });
      }
      if ((row.found_quantity ?? 0) > 0 && row.status !== "traded") {
        out.push({
          kind: "flare" as const,
          at: row.updated_at,
          text: `Found ${row.found_quantity} of ${name}`,
          href: roomHref(row.event_id),
        });
      }
      return out;
    }),
    ...(offers.data ?? []).map((row) => {
      const flare = offerFlareById.get(row.flare_id);
      return {
        kind: "offer" as const,
        at: row.created_at,
        text: `Offered ${row.quantity > 1 ? `${row.quantity} of ` : ""}${
          flare ? (cardName.get(flare.card_id) ?? "a card") : "a card"
        }${flare?.event_id ? ` in ${roomLabel(flare.event_id) ?? "a room"}` : ""}`,
        href: roomHref(flare?.event_id ?? null),
      };
    }),
    ...(logged.data ?? []).map((row) => ({
      kind: "logged" as const,
      at: `${row.traded_on}T12:00:00.000Z`,
      text: `Wrote down a trade: ${row.direction === "got" ? "got" : "gave"} ${
        cardName.get(row.card_id) ?? "a card"
      }${
        row.partner_player_id
          ? ` with ${partnerName.get(row.partner_player_id) ?? "a player"}`
          : row.partner_name
            ? ` with ${row.partner_name}`
            : ""
      }`,
      href: null,
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
      flares: openFlares.flares,
      flareRows: flares.count ?? 0,
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
