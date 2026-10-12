import "server-only";

import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";

/**
 * Nearby matching is LIVE: an ask that is gone is gone everywhere.
 *
 * The founder (2026-10-12): "if someone has a flare out, that gets
 * shown to these nearby people, then it needs to not be shown to them
 * in the future if that person who's looking for it removes their
 * flare in the future. it needs to be 'live'."
 *
 * The Feed card and "Wanted near you" are computed at read time from
 * the asks that exist, so they already follow. What outlived an ask
 * was the notice: the inbox row "Maya is looking for your Charizard"
 * stayed, with its unread dot, after Maya took the Flare down. This
 * clears those, right before the inbox or its badge is read, so it
 * covers every way an ask ends - deleted, found, closed, expired - and
 * the holder un-marking the card too, without every one of those
 * paths having to remember to call it.
 */

export type Ask = { kind: "want" | "flare"; id: string };

/** "nearby:want:<id>:<haveEntryId>" - the match notice's dedupe key. */
export function askFromNoticeKey(
  key: string | null,
): { ask: Ask; haveEntryId: string } | null {
  const match = /^nearby:(want|flare):([0-9a-f-]{36}):([0-9a-f-]{36})$/.exec(key ?? "");
  if (!match) return null;
  return {
    ask: { kind: match[1] as Ask["kind"], id: match[2] },
    haveEntryId: match[3],
  };
}

/** The asks of these that still stand: a want that exists, a Flare still open and not found. */
async function liveAsks(asks: Ask[]): Promise<Set<string>> {
  const admin = getSupabaseAdmin();
  const wantIds = [...new Set(asks.filter((a) => a.kind === "want").map((a) => a.id))];
  const flareIds = [
    ...new Set(asks.filter((a) => a.kind === "flare").map((a) => a.id)),
  ];
  const live = new Set<string>();

  if (wantIds.length > 0) {
    const { data, error } = await admin
      .from("player_wants")
      .select("id")
      .in("id", wantIds);
    /* A failed read proves nothing is gone: keep everything. */
    if (error) wantIds.forEach((id) => live.add(`want:${id}`));
    for (const row of data ?? []) live.add(`want:${row.id}`);
  }
  if (flareIds.length > 0) {
    const { data, error } = await admin
      .from("flares")
      .select("id, status, quantity, found_quantity")
      .in("id", flareIds);
    if (error) flareIds.forEach((id) => live.add(`flare:${id}`));
    for (const row of data ?? []) {
      if (row.status === "open" && (row.found_quantity ?? 0) < row.quantity) {
        live.add(`flare:${row.id}`);
      }
    }
  }
  return live;
}

/** Whether somebody is still asking: checked before a reply opens a conversation. */
export async function askIsLive(ask: Ask): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;
  return (await liveAsks([ask])).has(`${ask.kind}:${ask.id}`);
}

/**
 * Deletes this player's match notices whose ask is gone, or whose card
 * they no longer trade. Never throws: a stale notice is a nuisance, an
 * inbox that will not load is a broken screen.
 */
export async function pruneStaleNearbyNotices(playerId: string): Promise<void> {
  if (!isSupabaseConfigured()) return;
  try {
    const admin = getSupabaseAdmin();
    const { data: rows } = await admin
      .from("notifications")
      .select("id, dedupe_key")
      .eq("player_id", playerId)
      .eq("kind", "nearby-match")
      .limit(500);
    const notices = (rows ?? []).flatMap((row) => {
      const parsed = askFromNoticeKey(row.dedupe_key);
      return parsed ? [{ id: row.id, ...parsed }] : [];
    });
    if (notices.length === 0) return;

    const haveIds = [...new Set(notices.map((notice) => notice.haveEntryId))];
    const [live, { data: haves, error: havesError }] = await Promise.all([
      liveAsks(notices.map((notice) => notice.ask)),
      admin.from("player_cards").select("id").in("id", haveIds).eq("local_trade", true),
    ]);
    const traded = new Set((haves ?? []).map((row) => row.id));

    const stale = notices
      .filter(
        (notice) =>
          !live.has(`${notice.ask.kind}:${notice.ask.id}`) ||
          (!havesError && !traded.has(notice.haveEntryId)),
      )
      .map((notice) => notice.id);
    if (stale.length === 0) return;

    await admin.from("notifications").delete().in("id", stale);
  } catch (error) {
    console.error("Could not clear stale nearby notices", error);
  }
}
