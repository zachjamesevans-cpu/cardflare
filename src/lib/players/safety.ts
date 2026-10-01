import "server-only";

import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";

/**
 * Report and block: the safety valve the audit asked for.
 *
 * A block is the blocker's own word and is never announced. It takes
 * the blocked player out of the blocker's Feed and comment threads, and
 * closes the door on conversations in BOTH directions, because "stop
 * messaging me" has to work however the other person comes at it.
 * Follows are left alone: a block is quiet by design, and unfollowing
 * somebody who then sees the count drop is not quiet.
 *
 * A report is a note to the admins with a reason from a short list.
 * It lands in a queue and is resolved by hand; nothing automatic
 * happens to the reported player.
 */

export type ReportKind = "post" | "player" | "thread";
export type ReportReason = "spam" | "scam" | "harassment" | "other";

export const REPORT_REASONS: { value: ReportReason; label: string }[] = [
  { value: "spam", label: "Spam" },
  { value: "scam", label: "Scam or fake listing" },
  { value: "harassment", label: "Harassment" },
  { value: "other", label: "Something else" },
];

export interface BlockState {
  /** The viewer has blocked them. */
  blocked: boolean;
  /** They have blocked the viewer. */
  blockedBy: boolean;
}

const NONE: BlockState = { blocked: false, blockedBy: false };

export async function blockPlayer(
  blockerId: string,
  blockedId: string,
): Promise<boolean> {
  if (!isSupabaseConfigured() || blockerId === blockedId) return false;

  const { error } = await getSupabaseAdmin()
    .from("player_blocks")
    .upsert(
      { blocker_id: blockerId, blocked_id: blockedId },
      { onConflict: "blocker_id,blocked_id" },
    );

  if (error) {
    console.error("Could not block the player", error);
    return false;
  }
  return true;
}

export async function unblockPlayer(
  blockerId: string,
  blockedId: string,
): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;

  const { error } = await getSupabaseAdmin()
    .from("player_blocks")
    .delete()
    .eq("blocker_id", blockerId)
    .eq("blocked_id", blockedId);

  if (error) {
    console.error("Could not unblock the player", error);
    return false;
  }
  return true;
}

/** Both directions between two people, for a profile and a conversation. */
export async function blockState(
  viewerId: string | null,
  otherId: string,
): Promise<BlockState> {
  if (!isSupabaseConfigured() || !viewerId || viewerId === otherId) return NONE;

  const { data, error } = await getSupabaseAdmin()
    .from("player_blocks")
    .select("blocker_id, blocked_id")
    .or(
      `and(blocker_id.eq.${viewerId},blocked_id.eq.${otherId}),and(blocker_id.eq.${otherId},blocked_id.eq.${viewerId})`,
    );

  if (error) {
    console.error("Could not read the block state", error);
    return NONE;
  }

  return {
    blocked: (data ?? []).some((row) => row.blocker_id === viewerId),
    blockedBy: (data ?? []).some((row) => row.blocker_id === otherId),
  };
}

/** True when either has blocked the other: the conversation test. */
export async function blockedBetween(a: string, b: string): Promise<boolean> {
  const state = await blockState(a, b);
  return state.blocked || state.blockedBy;
}

/**
 * Everyone this player should not see, and everyone who should not see
 * them: both directions in one set, which is what the Feed filters by.
 * The second direction is the quiet half of a block: a person you
 * blocked does not get to keep reading you either.
 */
export async function blockedSet(playerId: string): Promise<Set<string>> {
  if (!isSupabaseConfigured()) return new Set();

  const { data, error } = await getSupabaseAdmin()
    .from("player_blocks")
    .select("blocker_id, blocked_id")
    .or(`blocker_id.eq.${playerId},blocked_id.eq.${playerId}`);

  if (error) {
    console.error("Could not read the block list", error);
    return new Set();
  }

  const out = new Set<string>();
  for (const row of data ?? []) {
    out.add(row.blocker_id === playerId ? row.blocked_id : row.blocker_id);
  }
  return out;
}

/** The people this player has blocked, with names, for the settings page. */
export async function listBlocked(
  playerId: string,
): Promise<{ playerId: string; displayName: string; handle: string | null }[]> {
  if (!isSupabaseConfigured()) return [];
  const admin = getSupabaseAdmin();

  const { data } = await admin
    .from("player_blocks")
    .select("blocked_id, created_at")
    .eq("blocker_id", playerId)
    .order("created_at", { ascending: false });
  const ids = (data ?? []).map((row) => row.blocked_id);
  if (ids.length === 0) return [];

  const { data: players } = await admin
    .from("players")
    .select("id, display_name, handle")
    .in("id", ids);
  const byId = new Map((players ?? []).map((row) => [row.id, row]));

  return ids.flatMap((id) => {
    const row = byId.get(id);
    return row
      ? [{ playerId: id, displayName: row.display_name, handle: row.handle ?? null }]
      : [];
  });
}

/**
 * Files a report. The player behind the target is resolved here so the
 * queue can group by person after the post is gone. A target that
 * cannot be resolved is refused rather than filed blind.
 */
export async function reportTarget(
  reporterId: string,
  kind: ReportKind,
  targetId: string,
  reason: ReportReason,
  note: string | null,
): Promise<
  { ok: true } | { ok: false; reason: "not-found" | "yourself" | "unavailable" }
> {
  if (!isSupabaseConfigured()) return { ok: false, reason: "unavailable" };
  const admin = getSupabaseAdmin();

  let targetPlayerId: string | null = null;
  if (kind === "player") {
    const { data } = await admin
      .from("players")
      .select("id")
      .eq("id", targetId)
      .maybeSingle();
    if (!data) return { ok: false, reason: "not-found" };
    targetPlayerId = data.id;
  } else if (kind === "post") {
    const { data } = await admin
      .from("flare_posts")
      .select("id, player_id")
      .eq("id", targetId)
      .maybeSingle();
    if (!data) return { ok: false, reason: "not-found" };
    targetPlayerId = data.player_id ?? null;
  } else {
    const { data } = await admin
      .from("flare_threads")
      .select("id, author_player_id, responder_player_id")
      .eq("id", targetId)
      .maybeSingle();
    if (!data) return { ok: false, reason: "not-found" };
    if (
      data.author_player_id !== reporterId &&
      data.responder_player_id !== reporterId
    ) {
      return { ok: false, reason: "not-found" };
    }
    targetPlayerId =
      data.author_player_id === reporterId
        ? data.responder_player_id
        : data.author_player_id;
  }

  if (targetPlayerId === reporterId) return { ok: false, reason: "yourself" };

  const { error } = await admin.from("player_reports").insert({
    reporter_id: reporterId,
    target_kind: kind,
    target_id: targetId,
    target_player_id: targetPlayerId,
    reason,
    note,
  });

  if (error) {
    console.error("Could not file the report", error);
    return { ok: false, reason: "unavailable" };
  }
  return { ok: true };
}

export interface OpenReport {
  id: string;
  createdAt: string;
  kind: ReportKind;
  targetId: string;
  reason: ReportReason;
  note: string | null;
  reporter: { playerId: string; displayName: string };
  target: { playerId: string; displayName: string } | null;
  /** Where an admin can look: the profile, or the post on the Feed. */
  href: string;
}

/** The queue, newest first. */
export async function listOpenReports(limit = 100): Promise<OpenReport[]> {
  if (!isSupabaseConfigured()) return [];
  const admin = getSupabaseAdmin();

  const { data, error } = await admin
    .from("player_reports")
    .select(
      "id, created_at, target_kind, target_id, target_player_id, reason, note, reporter_id",
    )
    .eq("status", "open")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("Could not list the reports", error);
    return [];
  }
  const rows = data ?? [];
  if (rows.length === 0) return [];

  const ids = [
    ...new Set(
      rows.flatMap((row) => [
        row.reporter_id,
        ...(row.target_player_id ? [row.target_player_id] : []),
      ]),
    ),
  ];
  const { data: players } = await admin
    .from("players")
    .select("id, display_name")
    .in("id", ids);
  const nameOf = new Map((players ?? []).map((row) => [row.id, row.display_name]));

  return rows.map((row) => ({
    id: row.id,
    createdAt: row.created_at,
    kind: row.target_kind as ReportKind,
    targetId: row.target_id,
    reason: row.reason as ReportReason,
    note: row.note,
    reporter: {
      playerId: row.reporter_id,
      displayName: nameOf.get(row.reporter_id) ?? "A player",
    },
    target: row.target_player_id
      ? {
          playerId: row.target_player_id,
          displayName: nameOf.get(row.target_player_id) ?? "A player",
        }
      : null,
    href:
      row.target_kind === "player"
        ? `/p/${row.target_id}`
        : row.target_player_id
          ? `/p/${row.target_player_id}`
          : "/feed",
  }));
}

export async function openReportCount(): Promise<number> {
  if (!isSupabaseConfigured()) return 0;
  const { count } = await getSupabaseAdmin()
    .from("player_reports")
    .select("id", { count: "exact", head: true })
    .eq("status", "open");
  return count ?? 0;
}

export async function resolveReport(
  id: string,
  resolvedBy: string | null,
): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;
  const { error } = await getSupabaseAdmin()
    .from("player_reports")
    .update({
      status: "resolved",
      resolved_at: new Date().toISOString(),
      resolved_by: resolvedBy,
    })
    .eq("id", id);
  if (error) {
    console.error("Could not resolve the report", error);
    return false;
  }
  return true;
}
