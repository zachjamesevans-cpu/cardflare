import "server-only";

import { conversationIdFor } from "@/lib/local/pairs";
import { avatarSrc } from "@/lib/players/profile-image";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";

/**
 * A player's past Flares, for History: what they asked for or put up,
 * how it ended, and who answered.
 *
 * The founder, looking at greyed-out "FOUND" rows on Post a Flare: "past
 * flares should live somewhere, or a flare history of sorts... it could
 * be cool to see a log of who answered the flare, date and time etc." A
 * Flare is past when it is no longer open (traded or taken down), or
 * when every copy it asked for has been found. The Flare tab shows only
 * the ones still working; these live here.
 *
 * Free for everyone, unlike trade rows: it is a player's own log of
 * their own posts, and nothing in it is anyone else's to withhold.
 */

export type FlareOutcome = "found" | "traded" | "taken-down";

export interface FlareHistoryResponder {
  playerId: string | null;
  name: string;
  avatarUrl: string | null;
  /** When they answered. */
  at: string;
  /** How many copies they said they could bring. */
  quantity: number;
  /** Your conversation with them, when there is one to open. */
  threadId: string | null;
}

export interface FlareHistoryEntry {
  flareId: string;
  direction: "want" | "showcase";
  cardId: string;
  cardName: string;
  cardNumber: string;
  imageUrl: string | null;
  quantity: number;
  outcome: FlareOutcome;
  postedAt: string;
  /** When it stopped being open: the last change to it. */
  endedAt: string;
  responders: FlareHistoryResponder[];
}

const LIMIT = 100;

export async function listFlareHistory(playerId: string): Promise<FlareHistoryEntry[]> {
  if (!isSupabaseConfigured()) return [];
  const admin = getSupabaseAdmin();

  const { data: sessions } = await admin
    .from("player_sessions")
    .select("id")
    .eq("player_id", playerId);
  const sessionIds = (sessions ?? []).map((row) => row.id);
  const owned =
    sessionIds.length > 0
      ? `player_id.eq.${playerId},player_session_id.in.(${sessionIds
          .map((id) => `"${id}"`)
          .join(",")})`
      : `player_id.eq.${playerId}`;

  const { data: flares, error } = await admin
    .from("flares")
    .select(
      "id, created_at, updated_at, status, intent, card_id, printing_id, quantity, found_quantity",
    )
    .or(owned)
    .order("updated_at", { ascending: false })
    .limit(LIMIT * 3);
  if (error) {
    console.error("Could not read the Flare history", error);
    return [];
  }

  const past = (flares ?? [])
    .filter(
      (flare) =>
        flare.status !== "open" || (flare.found_quantity ?? 0) >= flare.quantity,
    )
    .slice(0, LIMIT);
  if (past.length === 0) return [];

  const cardIds = [...new Set(past.map((flare) => flare.card_id))];
  const printingIds = [
    ...new Set(past.flatMap((flare) => (flare.printing_id ? [flare.printing_id] : []))),
  ];
  const flareIds = past.map((flare) => flare.id);

  const [
    { data: cards },
    { data: printed },
    { data: base },
    { data: responses },
    { data: anchors },
  ] = await Promise.all([
    admin
      .from("cards")
      .select("id, exact_name, canonical_card_number")
      .in("id", cardIds),
    printingIds.length > 0
      ? admin.from("card_printings").select("id, image_url").in("id", printingIds)
      : Promise.resolve({ data: [] as { id: string; image_url: string | null }[] }),
    admin
      .from("card_printings")
      .select("card_id, image_url")
      .in("card_id", cardIds)
      .not("image_url", "is", null),
    admin
      .from("flare_responses")
      .select("flare_id, responder_session_id, quantity, created_at")
      .in("flare_id", flareIds)
      .order("created_at", { ascending: true }),
    /* "I have this" on a Flare opened a thread: its responder answered. */
    admin
      .from("flare_threads")
      .select("id, flare_id, responder_player_id, created_at")
      .in("flare_id", flareIds),
  ]);

  const cardById = new Map((cards ?? []).map((row) => [row.id, row]));
  const printedArt = new Map((printed ?? []).map((row) => [row.id, row.image_url]));
  const baseArt = new Map<string, string>();
  for (const row of base ?? []) {
    if (!baseArt.has(row.card_id) && row.image_url)
      baseArt.set(row.card_id, row.image_url);
  }

  /* Who stands behind each responding session, and their faces. */
  const responderSessions = [
    ...new Set((responses ?? []).map((row) => row.responder_session_id)),
  ];
  const { data: sessionRows } =
    responderSessions.length > 0
      ? await admin
          .from("player_sessions")
          .select("id, player_id, display_name")
          .in("id", responderSessions)
      : {
          data: [] as { id: string; player_id: string | null; display_name: string }[],
        };
  const sessionById = new Map((sessionRows ?? []).map((row) => [row.id, row]));
  const playerIds = [
    ...new Set([
      ...(sessionRows ?? []).flatMap((row) => (row.player_id ? [row.player_id] : [])),
      ...(anchors ?? []).map((row) => row.responder_player_id),
    ]),
  ].filter((id) => id !== playerId);
  const { data: players } =
    playerIds.length > 0
      ? await admin
          .from("players")
          .select("id, display_name, avatar_url")
          .in("id", playerIds)
      : {
          data: [] as { id: string; display_name: string; avatar_url: string | null }[],
        };
  const playerById = new Map((players ?? []).map((row) => [row.id, row]));

  /* One conversation per person: found once per responder, not per Flare. */
  const threadByPlayer = new Map<string, string | null>();
  for (const anchor of anchors ?? []) {
    if (!threadByPlayer.has(anchor.responder_player_id)) {
      threadByPlayer.set(
        anchor.responder_player_id,
        await conversationIdFor(anchor.id),
      );
    }
  }

  return past.flatMap((flare) => {
    const card = cardById.get(flare.card_id);
    if (!card) return [];

    const seen = new Set<string>();
    const responders: FlareHistoryResponder[] = [];
    for (const row of (responses ?? []).filter((r) => r.flare_id === flare.id)) {
      const session = sessionById.get(row.responder_session_id);
      const key = session?.player_id ?? row.responder_session_id;
      if (seen.has(key)) continue;
      seen.add(key);
      const player = session?.player_id ? playerById.get(session.player_id) : undefined;
      responders.push({
        playerId: session?.player_id ?? null,
        name: player?.display_name ?? session?.display_name ?? "A player",
        avatarUrl: avatarSrc(player?.avatar_url),
        at: row.created_at,
        quantity: row.quantity,
        threadId: session?.player_id
          ? (threadByPlayer.get(session.player_id) ?? null)
          : null,
      });
    }
    for (const anchor of (anchors ?? []).filter((a) => a.flare_id === flare.id)) {
      if (seen.has(anchor.responder_player_id)) continue;
      seen.add(anchor.responder_player_id);
      const player = playerById.get(anchor.responder_player_id);
      responders.push({
        playerId: anchor.responder_player_id,
        name: player?.display_name ?? "A player",
        avatarUrl: avatarSrc(player?.avatar_url),
        at: anchor.created_at,
        quantity: 1,
        threadId: threadByPlayer.get(anchor.responder_player_id) ?? null,
      });
    }
    responders.sort((a, b) => a.at.localeCompare(b.at));

    const outcome: FlareOutcome =
      flare.status === "traded"
        ? "traded"
        : flare.status === "cancelled"
          ? "taken-down"
          : "found";

    return [
      {
        flareId: flare.id,
        direction:
          flare.intent === "showcase" ? ("showcase" as const) : ("want" as const),
        cardId: flare.card_id,
        cardName: card.exact_name,
        cardNumber: card.canonical_card_number,
        imageUrl:
          (flare.printing_id && printedArt.get(flare.printing_id)) ||
          baseArt.get(flare.card_id) ||
          null,
        quantity: flare.quantity,
        outcome,
        postedAt: flare.created_at,
        endedAt: flare.updated_at,
        responders,
      },
    ];
  });
}
