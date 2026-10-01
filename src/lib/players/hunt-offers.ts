import "server-only";

import { offerItems } from "@/lib/feed/posts";
import { cardFacts } from "@/lib/feed/repository";
import { openDirectThread, sendThreadMessage } from "@/lib/local/threads";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";

/**
 * "I have these", from somebody's hunt.
 *
 * A hunt is a standing list, and every open card on it can be answered
 * — whether or not its owner ever posted a Flare for it. The founder:
 * "If they're added to a hunt, they stay there... it always stays in
 * their hunts screen." So the visitor picks by REQUEST, and this sorts
 * the picks by what the server can do with each:
 *
 *   - a card with a live Flare goes through the post's own offer, the
 *     same `offerItems` the Feed uses, so the room's trade confirm and
 *     Embers still work and the owner reads it where they always have;
 *   - a card with no Flare up goes to the owner as a direct message —
 *     "I have X and Y from your Bonney hunt." — in the one conversation
 *     the two of them share.
 *
 * One send, and the owner hears from the visitor once.
 */

export interface HuntOfferLine {
  requestId: string;
  quantity: number;
}

export type HuntOfferOutcome =
  | {
      ok: true;
      /** Cards offered on a post. */
      offered: number;
      /** Cards sent as a message instead. */
      messaged: number;
      /** The conversation the message went to, when one was sent. */
      threadId: string | null;
      /** Cards that could not be taken, by name. */
      refused: string[];
    }
  | { ok: false; message: string; refused: string[] };

const MAX_NOTE = 280;

/** "Luffy (OP01-001), Zoro ×2 and Nami" */
function listOf(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

export async function offerOnHunt(
  huntId: string,
  player: { id: string; displayName: string },
  lines: HuntOfferLine[],
  rawMessage: string,
): Promise<HuntOfferOutcome> {
  if (!isSupabaseConfigured()) {
    return { ok: false, message: "Could not send that.", refused: [] };
  }
  if (lines.length === 0)
    return { ok: false, message: "Pick a card first.", refused: [] };

  const admin = getSupabaseAdmin();
  const note = rawMessage.replace(/\s+/g, " ").trim().slice(0, MAX_NOTE);

  const { data: hunt } = await admin
    .from("hunts")
    .select("id, player_id, name, visibility")
    .eq("id", huntId)
    .maybeSingle();
  if (!hunt || (hunt.visibility === "private" && hunt.player_id !== player.id)) {
    return { ok: false, message: "That hunt is gone.", refused: [] };
  }
  if (hunt.player_id === player.id) {
    return { ok: false, message: "That one is yours.", refused: [] };
  }

  const requestIds = [...new Set(lines.map((line) => line.requestId))];
  const [{ data: requests }, { data: flares }] = await Promise.all([
    admin
      .from("hunt_requests")
      .select("id, card_id, quantity_needed, quantity_found")
      .eq("hunt_id", huntId)
      .in("id", requestIds),
    admin
      .from("flares")
      .select("id, posted_batch, hunt_request_id, created_at")
      .eq("status", "open")
      .in("hunt_request_id", requestIds)
      .order("created_at", { ascending: false }),
  ]);

  const requestById = new Map((requests ?? []).map((row) => [row.id, row]));
  const facts = await cardFacts((requests ?? []).map((row) => row.card_id));

  /* The newest open Flare per request, when there is one with a post. */
  const flareByRequest = new Map<string, { id: string; postId: string }>();
  for (const flare of flares ?? []) {
    if (!flare.hunt_request_id || !flare.posted_batch) continue;
    if (!flareByRequest.has(flare.hunt_request_id)) {
      flareByRequest.set(flare.hunt_request_id, {
        id: flare.id,
        postId: flare.posted_batch,
      });
    }
  }

  const refused: string[] = [];
  const byPost = new Map<string, { flareId: string; quantity: number }[]>();
  const toMessage: string[] = [];

  for (const line of lines) {
    const request = requestById.get(line.requestId);
    const fact = request ? facts.get(request.card_id) : undefined;
    const name = fact ? `${fact.cardName} (${fact.cardNumber})` : "one card";
    const remaining = request ? request.quantity_needed - request.quantity_found : 0;
    if (!request || remaining <= 0) {
      refused.push(name);
      continue;
    }
    const quantity = Math.max(1, Math.min(remaining, Math.round(line.quantity)));

    const flare = flareByRequest.get(request.id);
    if (flare) {
      byPost.set(flare.postId, [
        ...(byPost.get(flare.postId) ?? []),
        { flareId: flare.id, quantity },
      ]);
    } else {
      toMessage.push(quantity > 1 ? `${name} ×${quantity}` : name);
    }
  }

  if (byPost.size === 0 && toMessage.length === 0) {
    return { ok: false, message: "Those cards were all found already.", refused };
  }

  let offered = 0;
  let failure: string | null = null;
  const flareNames = new Map<string, string>();
  for (const [requestId, flare] of flareByRequest) {
    const request = requestById.get(requestId);
    const fact = request ? facts.get(request.card_id) : undefined;
    if (fact) flareNames.set(flare.id, `${fact.cardName} (${fact.cardNumber})`);
  }

  for (const [postId, group] of byPost) {
    const outcome = await offerItems(
      postId,
      player.id,
      player.displayName,
      group,
      note,
    );
    for (const flareId of outcome.refused ?? []) {
      refused.push(flareNames.get(flareId) ?? "one card");
    }
    if (outcome.ok) {
      offered += outcome.offered;
      continue;
    }
    failure =
      outcome.reason === "own-flare"
        ? "That one is yours."
        : outcome.reason === "nothing-left"
          ? "Those cards were all found already."
          : outcome.reason === "at-cap"
            ? "You have offers on the most cards this room allows."
            : "Could not send the offer.";
  }

  let messaged = 0;
  let threadId: string | null = null;
  if (toMessage.length > 0) {
    const opened = await openDirectThread(player.id, hunt.player_id);
    if (opened.ok) {
      const body = `I have ${listOf(toMessage)} from your ${hunt.name} hunt.${
        note ? ` ${note}` : ""
      }`;
      const sent = await sendThreadMessage(opened.threadId, player.id, body);
      if (sent.ok) {
        messaged = toMessage.length;
        threadId = opened.threadId;
      } else {
        refused.push(...toMessage);
        failure ??= "Could not send the message.";
      }
    } else {
      refused.push(...toMessage);
      failure ??=
        opened.reason === "closed"
          ? "This conversation was ended."
          : "Could not send the message.";
    }
  }

  if (offered === 0 && messaged === 0) {
    return { ok: false, message: failure ?? "Could not send that.", refused };
  }
  return { ok: true, offered, messaged, threadId, refused };
}
