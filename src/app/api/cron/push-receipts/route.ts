import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * The receipts behind yesterday's pushes.
 *
 * Expo answers a send with a ticket; only the receipt, fetched later,
 * says "DeviceNotRegistered" for a phone that deleted the app. Until
 * this pass the sender read the tickets alone, so a dead token was
 * never pruned and got paid for on every notice. Daily, like the other
 * crons: read the receipts for every ticket older than a quarter hour,
 * delete the devices Apple or Google said are gone, and drop the
 * tickets either way. A receipt Expo no longer holds (they keep them a
 * day) is treated as fine, since there is nothing left to learn.
 *
 * Guarded by CRON_SECRET, fail-closed, like the board-open cron.
 */
const RECEIPTS_ENDPOINT = "https://exp.host/--/api/v2/push/getReceipts";
const BATCH = 300;
const SETTLE_MS = 15 * 60 * 1000;

export async function GET(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  if (!isSupabaseConfigured())
    return Response.json({ ok: false, reason: "unavailable" });

  const admin = getSupabaseAdmin();
  const { data: tickets, error } = await admin
    .from("push_tickets")
    .select("id, ticket_id, device_id")
    .lt("created_at", new Date(Date.now() - SETTLE_MS).toISOString())
    .order("created_at")
    .limit(BATCH);
  if (error) {
    console.error("Could not read the push tickets", error);
    return Response.json({ ok: false, reason: "unavailable" }, { status: 503 });
  }
  if (!tickets || tickets.length === 0)
    return Response.json({ ok: true, read: 0, pruned: 0 });

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
    return Response.json({ ok: false, reason: "push-service" }, { status: 503 });
  }

  /* Read or unreadable, the tickets have told what they can. */
  await admin
    .from("push_tickets")
    .delete()
    .in(
      "id",
      tickets.map((ticket) => ticket.id),
    );

  return Response.json({ ok: true, read: tickets.length, pruned });
}
