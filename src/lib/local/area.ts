import "server-only";

import { randomUUID } from "node:crypto";

import { nearestPostalCode, normalisePostalCode, type Point } from "@/lib/geo/zip";
import { afterWantSaved } from "@/lib/nearby/matching";
import { keepShowcaseAsHave } from "@/lib/nearby/showcase";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";

/**
 * Posting a Flare from wherever you are.
 *
 * The founder, on what Local should be: "people can see all flares nearby
 * and can message people directly. should be intuitive." Until now a
 * Flare could only be posted by standing at a counter with a QR code, so
 * Local could only show what had been posted at a shop — which on any of
 * the twenty-six nights nobody is at locals is nothing at all.
 *
 * An area Flare is the same act minus the room: it says what you are
 * hunting, it is answered by a thread, and it is deliberately public. It
 * is NOT your want list. Nothing here reads `player_wants`, and nothing
 * ever should: a saved want is a private note and the oldest rule in the
 * product is that binders and lists stay private. This is the second
 * place a player can choose to be seen, and the choosing is the point.
 *
 * WHERE IT SITS, when it sits anywhere, is the poster's own five-digit
 * ZIP, copied onto the row. Not a device coordinate: a precise position
 * rides one request and is never stored, and this row outlives its
 * request by design. A ZIP is miles across, it is what the profile
 * already holds, and it is the coarsest anchor that can still answer
 * "near me".
 *
 * And it is optional. With Local switched off (src/lib/local/enabled.ts)
 * a Flare with no room goes to the poster's friends in the Feed, who
 * are found by friendship and not by distance, so demanding a ZIP
 * first was a wall in front of nothing. The founder: "No need to have
 * that requirement now because it just shows your flares to your
 * friends in the feed." A ZIP is still written when there is one, so
 * Local finds the Flare again the day it is switched back on.
 */

export type PostAreaFlareResult =
  | { ok: true; flareId: string }
  | {
      ok: false;
      reason: "already-posted" | "not-migrated" | "unavailable";
    };

/**
 * Whether the area-Flare columns are actually there.
 *
 * Deploying the app and applying the migrations are two acts in this
 * project and nothing runs the second one automatically, so there is
 * always a window where this code is live and `flares.player_id` does
 * not exist yet. Every insert then dies on a not-null `event_id` or an
 * unknown column, and the honest 500 that follows reaches a player as
 * "Could not post that" — which sends whoever reads it looking for a bug
 * in the app. One cheap probe turns that into a sentence that names the
 * real cause. The store directory answers the same question the same
 * way; see `directorySchemaReady`.
 */
export async function areaFlareSchemaReady(): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;

  const { error } = await getSupabaseAdmin()
    .from("flares")
    .select("player_id, posted_postal_code")
    .limit(1);

  return !error;
}

export type PostAreaFlaresResult =
  | {
      ok: true;
      batchId: string;
      posted: number;
      /** Cards already open from this account: skipped, not failed. */
      alreadyUp: number;
      /** Cards whose own insert failed while the rest went up. */
      failed: number;
    }
  | {
      ok: false;
      reason: "already-posted" | "not-migrated" | "unavailable";
    };

/** What became of one card in a batch, in the order it was given. */
export type AreaRowOutcome =
  | { status: "posted"; flareId: string }
  | { status: "already-up" }
  | { status: "failed" };

/** The migration's shapes: a missing column, a not-null event_id, the
    two-shapes check. All one cause, and not the player's. */
const NOT_MIGRATED_CODES = ["42703", "23502", "23514"];

export interface AreaFlareInput {
  cardId: string;
  /** Null means any printing will do — the same default a board uses. */
  printingId?: string | null;
  quantity?: number;
  note?: string | null;
  /** "want" is hunting it; "showcase" is offering it up. */
  intent?: "want" | "showcase";
  acceptsTrade?: boolean;
  acceptsCash?: boolean;
  /** The hunt request this card answers, written with the row. */
  huntRequestId?: string | null;
}

export async function postAreaFlare(
  playerId: string,
  input: AreaFlareInput,
  /*
   * Where the poster is browsing from, when they granted it.
   *
   * Local takes EITHER a device coordinate or the profile's ZIP as an
   * origin, and the first cut of this function accepted only the ZIP —
   * so everyone who had granted the browser the more precise thing was
   * told to go and type the less precise one before they could post.
   * The coordinate rides this one request and is snapped to a centroid;
   * what lands on the row is five digits, exactly as if they had been
   * typed, and the position itself is never written.
   */
  at?: Point | null,
  /** Set when this card is one of several posted in one action. */
  group?: { batchId: string; deckLabel: string | null },
): Promise<PostAreaFlareResult> {
  if (!isSupabaseConfigured()) return { ok: false, reason: "unavailable" };

  if (!(await areaFlareSchemaReady())) return { ok: false, reason: "not-migrated" };

  const admin = getSupabaseAdmin();
  const postalCode = await postalCodeFor(playerId, at);

  const { data, error } = await admin
    .from("flares")
    .insert(areaRow(playerId, input, postalCode, group))
    .select("id")
    .single();

  if (error) {
    /* The partial unique index: one open area Flare per card per person.
       Posting the same card twice is not an error worth a red line — it
       is already up. */
    if (error.code === "23505") return { ok: false, reason: "already-posted" };

    /* The shapes a missing migration takes: the column is not there, or
       `event_id` is still not-null, or the two-shapes check still
       demands a ZIP this row does not carry. */
    if (NOT_MIGRATED_CODES.includes(error.code ?? "")) {
      console.error("The area-Flare migration has not been applied", error);
      return { ok: false, reason: "not-migrated" };
    }

    console.error("Could not post the area Flare", error);
    return { ok: false, reason: "unavailable" };
  }

  afterAreaPost(playerId, input);
  return { ok: true, flareId: data.id };
}

/*
 * The ZIP when there is one, from the profile first and a granted
 * position second, snapped to a centroid. None is not a refusal any
 * more: the Flare goes to friends either way, and only Local's radius
 * would have wanted the anchor. Read once per post, never per card.
 */
async function postalCodeFor(
  playerId: string,
  at?: Point | null,
): Promise<string | null> {
  const { data: player } = await getSupabaseAdmin()
    .from("players")
    .select("postal_code")
    .eq("id", playerId)
    .maybeSingle();

  return (
    normalisePostalCode(player?.postal_code) ?? nearestPostalCode(at ?? null) ?? null
  );
}

function areaRow(
  playerId: string,
  input: AreaFlareInput,
  postalCode: string | null,
  group?: { batchId: string; deckLabel: string | null },
) {
  return {
    event_id: null,
    player_session_id: null,
    player_id: playerId,
    posted_postal_code: postalCode,
    /* The batch is what makes several cards read as one post, exactly
       as it does on a room's board. A lone post is a batch of one: the
       column is NOT NULL. */
    posted_batch: group?.batchId ?? randomUUID(),
    deck_label: group?.deckLabel ?? null,
    card_id: input.cardId,
    printing_id: input.printingId ?? null,
    quantity: input.quantity ?? 1,
    note: input.note ?? null,
    intent: input.intent ?? "want",
    accepts_trade: input.acceptsTrade ?? true,
    accepts_cash: input.acceptsCash ?? false,
    /* Only when there is one, so a plain post's row keeps its shape. */
    ...(input.huntRequestId ? { hunt_request_id: input.huntRequestId } : {}),
  };
}

function afterAreaPost(playerId: string, input: AreaFlareInput): void {
  if (input.intent === "showcase") {
    /* "I have this", posted from the couch: onto the Have list, marked
       for nearby matching. See nearby/showcase.ts. */
    void keepShowcaseAsHave(
      { playerSessionId: null, playerId },
      {
        cardId: input.cardId,
        printingId: input.printingId ?? null,
        quantity: input.quantity ?? 1,
        note: input.note ?? null,
      },
    );
  } else {
    /* A Flare posted with no room is an ask nearby matching can answer. */
    void afterWantSaved(playerId, input.cardId);
  }
}

const rowKey = (
  cardId: string,
  printingId: string | null | undefined,
  intent: string,
) => `${cardId}::${printingId ?? "any"}::${intent}`;

type InsertedRow = {
  id: string;
  card_id: string;
  printing_id: string | null;
  intent: string;
};

/**
 * Several cards into one batch, in as few round trips as it takes.
 *
 * The first cut posted a deck one card at a time, and every card paid
 * for the schema probe, the player's ZIP and its own insert: a thirty
 * card paste was ninety sequential queries and could outlive the
 * serverless function. Now the probe and the ZIP are read once, the
 * cards already up are found in one read, and the rest go in ONE
 * insert. Only if that insert is refused (a race with the unique index,
 * the same card posted from another tab a moment ago) does it fall back
 * to one insert per card, so every card that can go up still does.
 *
 * Answers per card, in the order given, so a caller can say exactly
 * what happened: "Posted 18 of 20 · 2 were already up".
 */
export async function insertAreaFlares(
  playerId: string,
  inputs: AreaFlareInput[],
  at: Point | null | undefined,
  group: { batchId: string; deckLabel: string | null },
): Promise<
  | { ok: true; outcomes: AreaRowOutcome[] }
  | { ok: false; reason: "not-migrated" | "unavailable" }
> {
  if (!isSupabaseConfigured()) return { ok: false, reason: "unavailable" };
  if (!(await areaFlareSchemaReady())) return { ok: false, reason: "not-migrated" };

  const admin = getSupabaseAdmin();
  const postalCode = await postalCodeFor(playerId, at);

  /* What is already open from this account, in one read. */
  const cardIds = [...new Set(inputs.map((input) => input.cardId))];
  const { data: open } = await admin
    .from("flares")
    .select("card_id, printing_id, intent")
    .eq("player_id", playerId)
    .is("event_id", null)
    .eq("status", "open")
    .in("card_id", cardIds);
  const taken = new Set(
    ((open ?? []) as Omit<InsertedRow, "id">[]).map((row) =>
      rowKey(row.card_id, row.printing_id, row.intent),
    ),
  );

  const outcomes: (AreaRowOutcome | null)[] = inputs.map((input) => {
    const key = rowKey(input.cardId, input.printingId, input.intent ?? "want");
    if (taken.has(key)) return { status: "already-up" };
    /* The same card twice in one paste: the first one goes up. */
    taken.add(key);
    return null;
  });
  const fresh = inputs
    .map((input, index) => ({ input, index }))
    .filter(({ index }) => outcomes[index] === null);

  if (fresh.length > 0) {
    const { data, error } = await admin
      .from("flares")
      .insert(fresh.map(({ input }) => areaRow(playerId, input, postalCode, group)))
      .select("id, card_id, printing_id, intent");

    if (error && NOT_MIGRATED_CODES.includes(error.code ?? "")) {
      console.error("The area-Flare migration has not been applied", error);
      return { ok: false, reason: "not-migrated" };
    }

    if (!error) {
      const byKey = new Map(
        ((data ?? []) as InsertedRow[]).map((row) => [
          rowKey(row.card_id, row.printing_id, row.intent),
          row.id,
        ]),
      );
      for (const { input, index } of fresh) {
        const flareId = byKey.get(
          rowKey(input.cardId, input.printingId, input.intent ?? "want"),
        );
        outcomes[index] = flareId
          ? { status: "posted", flareId }
          : { status: "failed" };
      }
    } else {
      if (error.code !== "23505") console.error("Could not post the batch", error);
      for (const { input, index } of fresh) {
        const { data: one, error: oneError } = await admin
          .from("flares")
          .insert(areaRow(playerId, input, postalCode, group))
          .select("id")
          .single();
        outcomes[index] = !oneError
          ? { status: "posted", flareId: one.id }
          : oneError.code === "23505"
            ? { status: "already-up" }
            : { status: "failed" };
      }
    }
  }

  const settled = outcomes.map(
    (outcome): AreaRowOutcome => outcome ?? { status: "failed" },
  );
  for (const [index, outcome] of settled.entries()) {
    if (outcome.status === "posted") afterAreaPost(playerId, inputs[index]);
  }
  return { ok: true, outcomes: settled };
}

/**
 * Several cards, posted as one thing.
 *
 * The founder: "should be able to post multiple flares in one group in
 * local — so it looks like one post." A board already works this way and
 * has since `posted_batch` arrived: a deck put up in one action is told
 * to the room once and shows as one item rather than thirty. Local was
 * one card at a time, so building a deck there meant thirty separate
 * posts scrolling past everybody nearby.
 *
 * One batch id across the lot, which is the whole mechanism — the feed
 * groups on it exactly as the room's board does, and nothing new is
 * needed in the schema to carry it.
 *
 * A card already up is NOT a failure. Re-posting a list after adding two
 * cards to it should cost two rows and say so, rather than refusing the
 * whole batch over the twenty-eight that were already there.
 */
export async function postAreaFlares(
  playerId: string,
  inputs: AreaFlareInput[],
  at?: Point | null,
  deckLabel?: string | null,
): Promise<PostAreaFlaresResult> {
  if (inputs.length === 0) return { ok: false, reason: "unavailable" };

  const batchId = randomUUID();
  const result = await insertAreaFlares(playerId, inputs, at, {
    batchId,
    deckLabel: deckLabel ?? null,
  });
  /* A missing migration is the same wall for every card: one answer. */
  if (!result.ok) return result;

  const count = (status: AreaRowOutcome["status"]) =>
    result.outcomes.filter((outcome) => outcome.status === status).length;
  const posted = count("posted");
  const alreadyUp = count("already-up");
  const failed = count("failed");

  /* A duplicate is somebody re-posting a list they have grown: counted
     and skipped, never a reason to refuse the cards that are new. */
  if (posted > 0) return { ok: true, batchId, posted, alreadyUp, failed };
  return {
    ok: false,
    reason: alreadyUp > 0 && failed === 0 ? "already-posted" : "unavailable",
  };
}

/**
 * Taking one down.
 *
 * Cancelled rather than deleted, the same as a board Flare: a thread
 * about it still exists and should still read, and a conversation whose
 * subject vanished is worse than one whose subject is closed.
 */
export async function withdrawAreaFlare(
  playerId: string,
  flareId: string,
): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;

  const { error } = await getSupabaseAdmin()
    .from("flares")
    .update({ status: "cancelled" })
    .eq("id", flareId)
    .eq("player_id", playerId)
    .is("event_id", null);

  if (error) console.error("Could not withdraw the area Flare", error);
  return !error;
}
