import "server-only";

import { randomUUID } from "node:crypto";

import type { Point } from "@/lib/geo/zip";
import { mergeItems } from "./draft-rules";
import { addFlare } from "@/lib/lists/repository";
import { insertAreaFlares } from "@/lib/local/area";
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
 *
 * A hunt never outlives a post that did not happen. The hunt is resolved
 * first, so a refused one costs nothing; but if no card then goes up, a
 * hunt this post started is deleted (its requests go with it). A hunt
 * that already existed keeps what was added: a card on a hunt stays
 * there whatever becomes of its Flare.
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
  | {
      ok: true;
      postId: string;
      /** Cards asked for, after repeats were merged. */
      total: number;
      posted: number;
      /** Already open from this account: skipped, not failed. */
      alreadyUp: number;
      /** Cards whose own write failed while the rest went up. */
      failed: number;
      /** The room's cap stopped it; the cards past it were not tried. */
      atCap: boolean;
      /** Which cards went up, so a client draws only those. */
      postedCardIds: string[];
      huntId: string | null;
    }
  | {
      ok: false;
      reason: "empty" | "hunt-limit" | "hunt-name" | "unavailable" | "already-posted";
      kept?: number;
      limit?: number;
    };

/** A new hunt's name as it will be stored; empty means none was given. */
export const cleanHuntName = (name: string) => name.replace(/\s+/g, " ").trim();

type Outcome = "posted" | "already-up" | "failed" | "untried";

export async function publishPost(input: PublishInput): Promise<PublishResult> {
  if (!isSupabaseConfigured()) return { ok: false, reason: "unavailable" };

  /* One row per card: the same card twice in a draft is more copies of
     it, never two lines. The picker guards this too; this is the
     server's word. */
  const items = mergeItems(
    input.items.map((item) => ({ ...item, printingId: item.printingId ?? null })),
  );
  if (items.length === 0) return { ok: false, reason: "empty" };

  /* "Name your hunt": a nameless hunt is refused before anything is
     written, never quietly dropped. */
  if (input.intent === "want" && input.hunt && "name" in input.hunt) {
    if (!cleanHuntName(input.hunt.name)) return { ok: false, reason: "hunt-name" };
  }

  const admin = getSupabaseAdmin();
  const caption =
    input.caption?.replace(/\s+/g, " ").trim().slice(0, CAPTION_MAX) || null;

  /* The hunt, before anything is posted, so a refused hunt costs nothing. */
  let huntId: string | null = null;
  let huntName: string | null = null;
  let huntIsNew = false;
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
      huntIsNew = started.created === true;
      huntName = cleanHuntName(input.hunt.name);
    }
    const linked = await addHuntRequests(input.playerId, huntId, items, "keep");
    if (!linked.ok) {
      if (huntIsNew) await admin.from("hunts").delete().eq("id", huntId);
      return { ok: false, reason: "unavailable" };
    }
    requestIds = linked.requestIds;
  }

  /* A hunt this post started, when nothing went up: deleted, and its
     requests with it (the cascade). A hunt that already existed is left
     alone — a card added to a hunt stays there, Flare or no Flare
     (tests/unit/hunt-persistence.test.ts). */
  const dropNewHunt = async () => {
    if (huntId && huntIsNew) await admin.from("hunts").delete().eq("id", huntId);
  };

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
    await dropNewHunt();
    return { ok: false, reason: "unavailable" };
  }

  /* Open to a trade, to cash, or to both, never to neither: the row's
     check constraint (flares_accepts_something) refuses that, and a
     client that sends nothing gets the same default a board post has
     always had. */
  const accepts = {
    acceptsTrade: input.acceptsTrade || !input.acceptsCash,
    acceptsCash: input.acceptsCash,
  };
  const outcomes: Outcome[] = items.map(() => "untried");
  let atCap = false;
  let notMigrated = false;

  if (input.eventId && input.session) {
    /* A board: card by card, because the room's cap is checked per Flare
       and a post that runs into it should post what fits and say so. */
    for (const [index, item] of items.entries()) {
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
        outcomes[index] = "failed";
        continue;
      }
      outcomes[index] = "posted";
    }

    /* addFlare upserts and says nothing about the row: read the posted
       ones back in ONE query, by the same key the unique index uses, and
       point each at its hunt request (and the first at the caption). */
    const postedIds = items
      .filter((_, index) => outcomes[index] === "posted")
      .map((item) => item.cardId);
    if (postedIds.length > 0 && (requestIds.length > 0 || caption)) {
      const { data } = await admin
        .from("flares")
        .select("id, card_id, printing_id")
        .eq("event_id", input.eventId)
        .eq("player_session_id", input.session.id)
        .eq("intent", input.intent)
        .in("card_id", postedIds);
      const rows = (data ?? []) as {
        id: string;
        card_id: string;
        printing_id: string | null;
      }[];
      await Promise.all(
        items.map((item, index) => {
          if (outcomes[index] !== "posted") return null;
          const requestId = requestIds[index] ?? null;
          const note = index === 0 ? caption : null;
          if (!requestId && !note) return null;
          const row = rows.find(
            (candidate) =>
              candidate.card_id === item.cardId &&
              (candidate.printing_id ?? null) === item.printingId,
          );
          if (!row) return null;
          return admin
            .from("flares")
            .update({ hunt_request_id: requestId, note })
            .eq("id", row.id);
        }),
      );
    }
  } else {
    /* The area: one schema probe, one ZIP read, one insert for the lot. */
    const result = await insertAreaFlares(
      input.playerId,
      items.map((item, index) => ({
        cardId: item.cardId,
        printingId: item.printingId,
        quantity: item.quantity,
        /* The caption rides the first card too, for readers that still
           take a post's words off its first flare. */
        note: index === 0 ? caption : null,
        intent: input.intent,
        acceptsTrade: accepts.acceptsTrade,
        acceptsCash: accepts.acceptsCash,
        huntRequestId: requestIds[index] ?? null,
      })),
      input.at,
      { batchId: postId, deckLabel: huntName },
    );
    if (!result.ok) {
      notMigrated = result.reason === "not-migrated";
      items.forEach((_, index) => (outcomes[index] = "failed"));
    } else {
      result.outcomes.forEach((outcome, index) => {
        outcomes[index] = outcome.status;
      });
    }
  }

  const count = (kind: Outcome) => outcomes.filter((outcome) => outcome === kind).length;
  const posted = count("posted");
  const alreadyUp = count("already-up");

  if (posted === 0) {
    await admin.from("flare_posts").delete().eq("id", postId);
    await dropNewHunt();
    if (alreadyUp > 0 && count("failed") === 0 && !atCap) {
      return { ok: false, reason: "already-posted" };
    }
    if (notMigrated) console.error("Publishing needs the area-Flare migration");
    return { ok: false, reason: "unavailable" };
  }

  const postedItems = items.filter((_, index) => outcomes[index] === "posted");

  /* A want follows the player to the next store as a Flare on their
     list, whether it went up on a board or into the Feed. The founder,
     on Feed posts missing from the list: "This section needs to
     update the second a flare gets posted." Side by side, not one
     after another: each is its own small upsert. */
  if (input.intent === "want") {
    await Promise.all(
      postedItems.map((item) =>
        saveWant(input.playerId, {
          cardId: item.cardId,
          printingId: item.printingId,
          quantity: item.quantity,
          note: null,
          deckLabel: huntName,
        }),
      ),
    );
  }

  return {
    ok: true,
    postId,
    total: items.length,
    posted,
    alreadyUp,
    failed: count("failed"),
    atCap,
    postedCardIds: postedItems.map((item) => item.cardId),
    huntId,
  };
}
