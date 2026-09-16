import "server-only";

import { randomUUID } from "node:crypto";

import type { Point } from "@/lib/geo/zip";
import { mergeItems } from "./draft-rules";
import { addFlare } from "@/lib/lists/repository";
import { postAreaFlare } from "@/lib/local/area";
import { addHuntRequests, createHunt } from "@/lib/players/hunts";
import { saveWant } from "@/lib/players/wants";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";
import type { FlareIntent } from "@/lib/supabase/types";

/**
 * Publishing a Flare: one post, one or many cards.
 *
 * The founder's model: "A Flare is one social post containing one or
 * multiple cards. A Flare can optionally link its card requests to a
 * Hunt." So publishing writes the post first (`flare_posts`, keyed by
 * the batch id every card will carry), then a flare per card through
 * the same functions a room's board and the Flare tab have always used,
 * and finally points each card at its hunt request when the post joins
 * a hunt.
 *
 * Joining a hunt never duplicates a card already on it: the request is
 * found by card and printing and reused, its copies-needed left alone
 * ("keep"). A card new to the hunt is added with the copies this post
 * asks for. An OFFERING post never touches a hunt at all.
 */

export const CAPTION_MAX = 280;

export interface PublishItem {
  cardId: string;
  printingId: string | null;
  quantity: number;
}

export interface PublishInput {
  playerId: string;
  /** The room identity, for a board post; null posts to the area. */
  session: { id: string; displayName: string } | null;
  eventId: string | null;
  intent: FlareIntent;
  caption: string | null;
  items: PublishItem[];
  /** An existing hunt, or one to start by name. Ignored for offers. */
  hunt: { id: string } | { name: string } | null;
  acceptsTrade: boolean;
  acceptsCash: boolean;
  /** Where the poster is, for an area post. Rides the request only. */
  at: Point | null;
}

export type PublishResult =
  | { ok: true; postId: string; posted: number; huntId: string | null; atCap: boolean }
  | {
      ok: false;
      reason: "empty" | "hunt-limit" | "hunt-name" | "unavailable" | "already-posted";
      kept?: number;
      limit?: number;
    };

export async function publishPost(input: PublishInput): Promise<PublishResult> {
  if (!isSupabaseConfigured()) return { ok: false, reason: "unavailable" };

  /* One row per card: the same card twice in a draft is more copies of
     it, never two lines. The picker guards this too; this is the
     server's word. */
  const items = mergeItems(
    input.items.map((item) => ({ ...item, printingId: item.printingId ?? null })),
  );
  if (items.length === 0) return { ok: false, reason: "empty" };

  const admin = getSupabaseAdmin();
  const caption =
    input.caption?.replace(/\s+/g, " ").trim().slice(0, CAPTION_MAX) || null;

  /* The hunt, before anything is posted, so a refused hunt costs nothing. */
  let huntId: string | null = null;
  let huntName: string | null = null;
  let requestIds: string[] = [];
  if (input.intent === "want" && input.hunt) {
    if ("id" in input.hunt) {
      const { data } = await admin
        .from("hunts")
        .select("id, name")
        .eq("id", input.hunt.id)
        .eq("player_id", input.playerId)
        .maybeSingle();
      if (!data) return { ok: false, reason: "unavailable" };
      huntId = data.id;
      huntName = data.name;
    } else {
      const started = await createHunt(input.playerId, { name: input.hunt.name });
      if (!started.ok) {
        if (started.reason === "limit") {
          return {
            ok: false,
            reason: "hunt-limit",
            kept: started.kept,
            limit: started.limit,
          };
        }
        return {
          ok: false,
          reason: started.reason === "name" ? "hunt-name" : "unavailable",
        };
      }
      huntId = started.huntId;
      huntName = input.hunt.name.replace(/\s+/g, " ").trim();
    }
    const linked = await addHuntRequests(input.playerId, huntId, items, "keep");
    if (!linked.ok) return { ok: false, reason: "unavailable" };
    requestIds = linked.requestIds;
  }

  const postId = randomUUID();
  const { error: postError } = await admin.from("flare_posts").insert({
    id: postId,
    player_id: input.playerId,
    player_session_id: input.session?.id ?? null,
    intent: input.intent,
    caption,
    event_id: input.eventId,
    hunt_id: huntId,
  });
  if (postError) {
    console.error("Could not write the post", postError);
    return { ok: false, reason: "unavailable" };
  }

  const accepts = { acceptsTrade: input.acceptsTrade, acceptsCash: input.acceptsCash };
  let posted = 0;
  let atCap = false;
  let refused: PublishResult | null = null;

  for (const [index, item] of items.entries()) {
    const requestId = requestIds[index] ?? null;
    let flareId: string | null = null;

    if (input.eventId && input.session) {
      const result = await addFlare(
        input.eventId,
        input.session.id,
        {
          cardId: item.cardId,
          printingId: item.printingId,
          quantity: item.quantity,
          note: null,
          deckLabel: huntName,
        },
        input.intent,
        accepts,
        postId,
      );
      if (!result.ok) {
        if (result.reason === "at-cap") {
          atCap = true;
          break;
        }
        refused = { ok: false, reason: "unavailable" };
        continue;
      }
      /* addFlare upserts and says nothing about the row: read it back by
         the same key the unique index uses. */
      const { data } = await admin
        .from("flares")
        .select("id")
        .eq("event_id", input.eventId)
        .eq("player_session_id", input.session.id)
        .eq("card_id", item.cardId)
        .eq("intent", input.intent)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      flareId = data?.id ?? null;
    } else {
      const result = await postAreaFlare(
        input.playerId,
        {
          cardId: item.cardId,
          printingId: item.printingId,
          quantity: item.quantity,
          note: null,
          intent: input.intent,
          acceptsTrade: input.acceptsTrade,
          acceptsCash: input.acceptsCash,
        },
        input.at,
        { batchId: postId, deckLabel: huntName },
      );
      if (!result.ok) {
        refused = {
          ok: false,
          reason: result.reason === "already-posted" ? "already-posted" : "unavailable",
        };
        /* A missing migration is the same wall for every card. */
        if (result.reason === "not-migrated") break;
        continue;
      }
      flareId = result.flareId;
    }

    posted += 1;
    if (flareId && (requestId || caption)) {
      await admin
        .from("flares")
        .update({
          hunt_request_id: requestId,
          /* The caption rides the first card too, for readers that still
             take a post's words off its first flare. */
          note: index === 0 ? caption : null,
        })
        .eq("id", flareId);
    }
    /* A want follows the player to the next store as a saved request,
       exactly as a board post always has. */
    if (input.intent === "want" && input.eventId) {
      await saveWant(input.playerId, {
        cardId: item.cardId,
        printingId: item.printingId,
        quantity: item.quantity,
        note: null,
        deckLabel: huntName,
      });
    }
  }

  if (posted === 0) {
    await admin.from("flare_posts").delete().eq("id", postId);
    return refused ?? { ok: false, reason: "unavailable" };
  }

  return { ok: true, postId, posted, huntId, atCap };
}
