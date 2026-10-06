import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * The receipts behind yesterday's pushes.
 *
 * Expo answers a send with a ticket; only the receipt, fetched later,
 * says "DeviceNotRegistered" for a phone that deleted the app. Until
 * this pass the sender read the tickets alone, so a dead token was
 * never pruned and got paid for on every notice. Every two hours: read
 * the receipts for every ticket older than a quarter hour, delete the
 * devices Apple or Google said are gone, and drop the tickets either
 * way. A receipt Expo no longer holds (they keep them a day) is treated
 * as fine, since there is nothing left to learn.
 *
 * It pages through everything pending rather than reading one batch: a
 * busy day sends more tickets than one batch holds, and a daily pass
 * that read 300 left the rest to age past Expo's day and teach nothing.
 * Bounded by batches and by time so one run cannot outlive its function.
 *
 * Guarded by CRON_SECRET, fail-closed, like the board-open cron.
 */
const RECEIPTS_ENDPOINT = "https://exp.host/--/api/v2/push/getReceipts";
const BATCH = 300;
/** At most this many batches a run; the next run picks up the rest. */
const MAX_BATCHES = 40;
/** Stop starting batches once this much of the minute is spent. */
const TIME_BUDGET_MS = 45_000;
const SETTLE_MS = 15 * 60 * 1000;

type Admin = ReturnType<typeof getSupabaseAdmin>;

type BatchResult =
  | { ok: true; read: number; pruned: number }
  | { ok: false; reason: "unavailable" | "push-service" };

/** One batch: read, prune, drop. `read: 0` means nothing is left. */
async function settleBatch(admin: Admin, before: string): Promise<BatchResult> {
  const { data: tickets, error } = await admin
    .from("push_tickets")
    .select("id, ticket_id, device_id")
    .lt("created_at", before)
    .order("created_at")
    .limit(BATCH);
  if (error) {
    console.error("Could not read the push tickets", error);
    return { ok: false, reason: "unavailable" };
  }
  if (!tickets || tickets.length === 0) return { ok: true, read: 0, pruned: 0 };

  let pruned = 0;
  try {
    const response = await fetch(RECEIPTS_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: tickets.map((ticket) => ticket.ticket_id) }),
      signal: AbortSignal.timeout(20_000),
    });
    const result = (await response.json().catch(() => null)) as {
      data?: Record<string, { status: string; details?: { error?: string } }>;
    } | null;
    const dead = tickets
      .filter(
        (ticket) =>
          result?.data?.[ticket.ticket_id]?.details?.error === "DeviceNotRegistered",
      )
      .map((ticket) => ticket.device_id);
    if (dead.length > 0) {
      const { error: pruneError } = await admin
        .from("player_devices")
        .delete()
        .in("id", [...new Set(dead)]);
      if (pruneError) console.error("Could not prune dead devices", pruneError);
      else pruned = new Set(dead).size;
    }
  } catch (caught) {
    console.error("Could not read the push receipts", caught);
    return { ok: false, reason: "push-service" };
  }

  /* Read or unreadable, the tickets have told what they can. If the
     drop fails, stop: the next page would be this one again. */
  const { error: dropError } = await admin
    .from("push_tickets")
    .delete()
    .in(
      "id",
      tickets.map((ticket) => ticket.id),
    );
  if (dropError) {
    console.error("Could not drop the read push tickets", dropError);
    return { ok: false, reason: "unavailable" };
  }

  return { ok: true, read: tickets.length, pruned };
}

export async function GET(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  if (!isSupabaseConfigured())
    return Response.json({ ok: false, reason: "unavailable" });

  const admin = getSupabaseAdmin();
  const started = Date.now();
  const before = new Date(started - SETTLE_MS).toISOString();
  let read = 0;
  let pruned = 0;
  let batches = 0;

  while (batches < MAX_BATCHES && Date.now() - started < TIME_BUDGET_MS) {
    const batch = await settleBatch(admin, before);
    batches += 1;
    if (!batch.ok) {
      /* Whatever was settled before the failure stays settled. */
      return Response.json(
        { ok: false, reason: batch.reason, read, pruned },
        { status: 503 },
      );
    }
    read += batch.read;
    pruned += batch.pruned;
    if (batch.read < BATCH) break;
  }

  return Response.json({ ok: true, read, pruned, batches });
}
