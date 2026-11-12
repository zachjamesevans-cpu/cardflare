import "server-only";

import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";
import { sessionsForPlayers } from "@/lib/players/accounts";
import { countTradePartners, type PartnerTradeRow } from "./partner-rules";

/** More completed trades than this and the count is of the newest. */
const READ_LIMIT = 1000;

/**
 * How many different players this one has completed a trade with.
 * See partner-rules.ts for what counts and why it is people, not trades.
 *
 * Never throws and never takes a profile down: a read that fails is a
 * profile that says nothing about trades, which is what it said before.
 */
export async function tradePartnerCount(playerId: string): Promise<number> {
  if (!isSupabaseConfigured()) return 0;

  try {
    const admin = getSupabaseAdmin();
    const mine = [...(await sessionsForPlayers([playerId])).keys()];

    /* Room trades name the player's sessions; conversation trades name
       the account. Both sides of both, the way the history reads them. */
    const list = mine.map((id) => `"${id}"`).join(",");
    const sides = [
      `requester_player_id.eq.${playerId}`,
      `holder_player_id.eq.${playerId}`,
      ...(mine.length > 0
        ? [`requester_session_id.in.(${list})`, `holder_session_id.in.(${list})`]
        : []),
    ];

    const { data, error } = await admin
      .from("trades")
      .select(
        "requester_player_id, holder_player_id, requester_session_id, holder_session_id, acknowledged_at, disputed_at",
      )
      .or(sides.join(","))
      .not("acknowledged_at", "is", null)
      .is("disputed_at", null)
      .order("confirmed_at", { ascending: false })
      .limit(READ_LIMIT);

    if (error) {
      console.error("Could not count trade partners", error.code);
      return 0;
    }

    const rows = (data ?? []) as PartnerTradeRow[];
    if (rows.length === 0) return 0;

    /* The other chairs' accounts, for the trades written in a room. */
    const known = new Set(mine);
    const others = [
      ...new Set(
        rows.flatMap((row) =>
          [row.requester_session_id, row.holder_session_id].filter(
            (id): id is string => Boolean(id) && !known.has(id as string),
          ),
        ),
      ),
    ];
    const accountOf = new Map<string, string>(mine.map((id) => [id, playerId]));
    if (others.length > 0) {
      const { data: sessions } = await admin
        .from("player_sessions")
        .select("id, player_id")
        .in("id", others);
      for (const row of sessions ?? []) {
        if (row.player_id) accountOf.set(row.id, row.player_id);
      }
    }

    return countTradePartners(rows, playerId, accountOf);
  } catch (caught) {
    console.error("Could not count trade partners", caught);
    return 0;
  }
}
