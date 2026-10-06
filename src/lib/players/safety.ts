import "server-only";

import { afterResponse } from "@/lib/after-response";
import { conversationIdFor } from "@/lib/local/pairs";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";
import { notifyReportFiled } from "./report-alerts";

/**
 * Report and block: the safety valve the audit asked for.
 *
 * A block is the blocker's own word and is never announced. It takes
 * the blocked player out of the blocker's Feed and comment threads,
 * hides each profile from the other, and closes the door on
 * conversations in BOTH directions, because "stop messaging me" has to
 * work however the other person comes at it. It also cuts the follow
 * edges both ways (App Store guideline 1.2: a block has to actually
 * separate two people), and neither can follow the other again while
 * it stands.
 *
 * A report is a note to the admins with a reason from a short list.
 * It lands in a queue and is resolved by hand; nothing automatic
 * happens to the reported player.
 */

import {
  REPORT_KINDS,
  REPORT_REASONS,
  type ReportKind,
  type ReportReason,
} from "./safety-reasons";

export { REPORT_KINDS, REPORT_REASONS, type ReportKind, type ReportReason };

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

  /* The follows go, both directions. Logged, not failed: the block is
     what matters, and every list filters by it anyway. */
  const { error: followError } = await getSupabaseAdmin()
    .from("player_follows")
    .delete()
    .or(
      `and(follower_id.eq.${blockerId},followed_id.eq.${blockedId}),` +
        `and(follower_id.eq.${blockedId},followed_id.eq.${blockerId})`,
    );
  if (followError) console.error("Could not cut the follows on a block", followError);

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

/** The rows between two people, or null when the read failed. */
async function blockRows(
  viewerId: string,
  otherId: string,
): Promise<{ blocker_id: string; blocked_id: string }[] | null> {
  const { data, error } = await getSupabaseAdmin()
    .from("player_blocks")
    .select("blocker_id, blocked_id")
    .or(
      `and(blocker_id.eq.${viewerId},blocked_id.eq.${otherId}),and(blocker_id.eq.${otherId},blocked_id.eq.${viewerId})`,
    );

  if (error) {
    console.error("Could not read the block state", error);
    return null;
  }
  return data ?? [];
}

/**
 * Both directions between two people, for drawing a profile. A failed
 * read draws as no block; anything that SENDS asks `blockedBetween`,
 * which fails closed.
 */
export async function blockState(
  viewerId: string | null,
  otherId: string,
): Promise<BlockState> {
  if (!isSupabaseConfigured() || !viewerId || viewerId === otherId) return NONE;

  const rows = await blockRows(viewerId, otherId);
  if (!rows) return NONE;

  return {
    blocked: rows.some((row) => row.blocker_id === viewerId),
    blockedBy: rows.some((row) => row.blocker_id === otherId),
  };
}

/**
 * True when either has blocked the other: the test for anything that
 * reaches the other person (a message, a follow, a comment). Fails
 * CLOSED: when the block table cannot be read, the answer is "blocked",
 * because a message that should not have gone cannot be taken back.
 */
export async function blockedBetween(a: string, b: string): Promise<boolean> {
  if (!isSupabaseConfigured() || a === b) return false;
  const rows = await blockRows(a, b);
  if (!rows) return true;
  return rows.length > 0;
}

/**
 * The answer for a profile hidden by a block, or null when it is not.
 *
 * Somebody who was blocked gets exactly what a missing player gets, so
 * the block cannot be read off the response. The blocker gets a 404
 * too, with a code of their own, so their screen can offer Unblock and
 * nothing else.
 */
export function profileHiddenBy(state: BlockState): Response | null {
  if (state.blockedBy && !state.blocked) {
    return Response.json({ error: "No such player." }, { status: 404 });
  }
  if (state.blocked) {
    return Response.json(
      {
        error: "blocked",
        message: "You blocked this player.",
        blocked: true,
      },
      { status: 404 },
    );
  }
  return null;
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
 *
 * A conversation is filed under the pair's one chat (an old link may
 * hold an anchor's id), so the queue can open the messages themselves.
 * A comment keeps its words on the report, because its author or the
 * post's owner can delete it afterwards. The admins hear about every
 * report by email (`report-alerts`), best-effort.
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
  let storedTargetId = targetId;
  let excerpt: string | null = null;
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
  } else if (kind === "comment") {
    const { data } = await admin
      .from("flare_post_comments")
      .select("id, player_id, body")
      .eq("id", targetId)
      .maybeSingle();
    if (!data) return { ok: false, reason: "not-found" };
    targetPlayerId = data.player_id;
    excerpt = (data.body ?? "").slice(0, 500) || null;
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
    storedTargetId = (await conversationIdFor(targetId)) ?? targetId;
  }

  if (targetPlayerId === reporterId) return { ok: false, reason: "yourself" };

  const { error } = await admin.from("player_reports").insert({
    reporter_id: reporterId,
    target_kind: kind,
    target_id: storedTargetId,
    target_player_id: targetPlayerId,
    reason,
    note,
    target_excerpt: excerpt,
  });

  if (error) {
    console.error("Could not file the report", error);
    return { ok: false, reason: "unavailable" };
  }

  afterResponse(() => notifyReportFiled(kind, reason));
  return { ok: true };
}

/** One message of a reported conversation, as the queue shows it. */
export interface ReportedMessage {
  id: string;
  sentAt: string;
  senderName: string;
  /** Sent by the person who filed the report. */
  fromReporter: boolean;
  body: string;
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
  /** A reported comment's words, as they read when it was reported. */
  excerpt: string | null;
  /** A reported conversation's newest messages, oldest first; else empty. */
  messages: ReportedMessage[];
}

/** How much of a reported conversation the queue shows. */
const TRANSCRIPT_LIMIT = 50;

/**
 * A reported conversation's newest messages, for the admin queue only:
 * read with the service role, and called from `listOpenReports`, whose
 * one caller is the admin page behind `requireAdmin`.
 */
async function transcriptFor(
  threadId: string,
  reporterId: string,
  nameOf: Map<string, string>,
): Promise<ReportedMessage[]> {
  const { data, error } = await getSupabaseAdmin()
    .from("flare_messages")
    .select("id, sender_player_id, body, created_at")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: false })
    .limit(TRANSCRIPT_LIMIT);
  if (error) {
    console.error("Could not read the reported conversation", error);
    return [];
  }
  return [...(data ?? [])].reverse().map((row) => ({
    id: row.id,
    sentAt: row.created_at,
    senderName: nameOf.get(row.sender_player_id) ?? "A player",
    fromReporter: row.sender_player_id === reporterId,
    body: row.body,
  }));
}

/** The queue, newest first. */
export async function listOpenReports(limit = 100): Promise<OpenReport[]> {
  if (!isSupabaseConfigured()) return [];
  const admin = getSupabaseAdmin();

  const { data, error } = await admin
    .from("player_reports")
    .select(
      "id, created_at, target_kind, target_id, target_player_id, reason, note, reporter_id, target_excerpt",
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

  const transcripts = new Map(
    await Promise.all(
      rows
        .filter((row) => row.target_kind === "thread")
        .map(
          async (row) =>
            [
              row.id,
              await transcriptFor(row.target_id, row.reporter_id, nameOf),
            ] as const,
        ),
    ),
  );

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
    excerpt: row.target_excerpt ?? null,
    messages: transcripts.get(row.id) ?? [],
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
