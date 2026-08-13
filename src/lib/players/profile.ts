import "server-only";

import sharp from "sharp";

import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";
import { emberTier } from "./ember-rules";
import type { EmberTier } from "./ember-rules";
import type { Equipped } from "./cosmetics";
import {
  AVATAR_MAX_BYTES,
  AVATAR_MIME_TYPES,
  AVATAR_SIZE,
  avatarObjectPath,
} from "./profile-image";

/**
 * A player's profile: who they are, what they have earned, what they are
 * proud of.
 *
 * Two shapes deliberately, and the split is the founder's rule about the
 * two numbers made structural. `PublicProfile` is what anybody may see —
 * name, picture, lifetime Embers, showcase. `OwnProfile` adds the
 * spendable balance and nothing else is private. Because the balance
 * lives on a type that is only ever built for the signed-in player, a
 * future page cannot leak it by accident; it would have to ask for the
 * wrong function first.
 */

export interface ShowcaseCard {
  id: string;
  cardId: string;
  printingId: string | null;
  name: string;
  number: string;
  imageUrl: string | null;
  position: number;
}

export interface PublicProfile {
  playerId: string;
  displayName: string;
  avatarUrl: string | null;
  /** Lifetime. The badge. */
  embersEarned: number;
  tier: EmberTier;
  equipped: Equipped;
  showcase: ShowcaseCard[];
  joinedAt: string;
}

export interface OwnProfile extends PublicProfile {
  /** Unspent, and never on anybody else's screen. */
  embersBalance: number;
}

/** How many cards a profile shelf holds. Three across, three deep. */
export const SHOWCASE_LIMIT = 9;

async function loadProfile(playerId: string): Promise<OwnProfile | null> {
  if (!isSupabaseConfigured()) return null;

  const admin = getSupabaseAdmin();

  const { data: player, error } = await admin
    .from("players")
    .select("*")
    .eq("id", playerId)
    .maybeSingle();

  if (error || !player) {
    if (error) console.error("Could not read the profile", error);
    return null;
  }

  return {
    playerId: player.id,
    displayName: player.display_name,
    avatarUrl: player.avatar_url,
    embersEarned: player.embers_earned,
    embersBalance: player.embers_balance,
    tier: emberTier(player.embers_earned),
    equipped: {
      frame: player.equipped_frame,
      holo: player.equipped_holo,
      effect: player.equipped_effect,
    },
    showcase: await listShowcase(playerId),
    joinedAt: player.created_at,
  };
}

/** The signed-in player's own profile, balance included. */
export async function ownProfile(playerId: string): Promise<OwnProfile | null> {
  return loadProfile(playerId);
}

/**
 * Somebody else's profile.
 *
 * The balance is stripped here rather than left off the query, so
 * forgetting to strip it is impossible: the return type has no field to
 * put it in.
 */
export async function publicProfile(playerId: string): Promise<PublicProfile | null> {
  const full = await loadProfile(playerId);
  if (!full) return null;

  /*
   * Destructured out by name rather than deleted or omitted from the
   * query, so the balance's absence is a property of the object that
   * leaves this function rather than something a caller has to remember.
   */
  const { embersBalance, ...rest } = full;
  void embersBalance;
  return rest;
}

/* -------------------------------------------------------------------- */
/* The showcase                                                          */
/* -------------------------------------------------------------------- */

/**
 * The cards on a player's shelf.
 *
 * Card names and art resolved in a second query, the same reason as
 * everywhere else in this codebase: the hand-written schema mirror
 * carries no relationship metadata, so PostgREST embeds are unavailable.
 */
export async function listShowcase(playerId: string): Promise<ShowcaseCard[]> {
  if (!isSupabaseConfigured()) return [];

  const admin = getSupabaseAdmin();

  const { data, error } = await admin
    .from("player_showcase")
    .select("id, card_id, printing_id, position")
    .eq("player_id", playerId)
    .order("position")
    .limit(SHOWCASE_LIMIT);

  if (error) {
    console.error("Could not read the showcase", error);
    return [];
  }

  const rows = data ?? [];
  if (rows.length === 0) return [];

  const [cards, printings] = await Promise.all([
    admin
      .from("cards")
      .select("id, exact_name, canonical_card_number")
      .in("id", [...new Set(rows.map((row) => row.card_id))]),
    (() => {
      const ids = rows
        .map((row) => row.printing_id)
        .filter((id): id is string => Boolean(id));
      return ids.length > 0
        ? admin.from("card_printings").select("id, image_url").in("id", ids)
        : Promise.resolve({ data: [], error: null });
    })(),
  ]);

  if (cards.error || printings.error) {
    console.error("Could not resolve the showcase", cards.error ?? printings.error);
    return [];
  }

  const cardsById = new Map((cards.data ?? []).map((row) => [row.id, row]));
  const artById = new Map(
    (printings.data ?? []).map((row) => [row.id, row.image_url as string | null]),
  );

  return rows.map((row) => {
    const card = cardsById.get(row.card_id);
    return {
      id: row.id,
      cardId: row.card_id,
      printingId: row.printing_id,
      name: card?.exact_name ?? "Unknown card",
      number: card?.canonical_card_number ?? "",
      /* Raw as stored; `isRenderableImageUrl` is the gate, at render. */
      imageUrl: row.printing_id ? (artById.get(row.printing_id) ?? null) : null,
      position: row.position,
    };
  });
}

export type ShowcaseOutcome =
  { ok: true } | { ok: false; reason: "full" | "duplicate" | "unavailable" };

/**
 * Puts a card on the shelf.
 *
 * The shelf is capped at nine, and the cap is checked here rather than
 * in the database because "you have room for nine" is a sentence and a
 * check constraint is not. A tenth is refused rather than silently
 * pushing the first one off: nothing a player put there should vanish
 * because of something they did somewhere else.
 */
export async function addToShowcase(
  playerId: string,
  cardId: string,
  printingId: string | null,
): Promise<ShowcaseOutcome> {
  if (!isSupabaseConfigured()) return { ok: false, reason: "unavailable" };

  const admin = getSupabaseAdmin();

  const { count, error: countError } = await admin
    .from("player_showcase")
    .select("id", { count: "exact", head: true })
    .eq("player_id", playerId);

  if (countError) {
    console.error("Could not count the showcase", countError);
    return { ok: false, reason: "unavailable" };
  }

  if ((count ?? 0) >= SHOWCASE_LIMIT) return { ok: false, reason: "full" };

  const { error } = await admin.from("player_showcase").insert({
    player_id: playerId,
    card_id: cardId,
    printing_id: printingId,
    position: count ?? 0,
  });

  if (error) {
    // The unique index means it is already up there, which is not a failure.
    if (error.code === "23505") return { ok: false, reason: "duplicate" };
    console.error("Could not add to the showcase", error);
    return { ok: false, reason: "unavailable" };
  }

  return { ok: true };
}

/** Takes a card off the shelf. Scoped to the owner, so it cannot clear another's. */
export async function removeFromShowcase(
  playerId: string,
  entryId: string,
): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;

  const { error } = await getSupabaseAdmin()
    .from("player_showcase")
    .delete()
    .eq("id", entryId)
    .eq("player_id", playerId);

  if (error) {
    console.error("Could not remove from the showcase", error);
    return false;
  }

  return true;
}

/* -------------------------------------------------------------------- */
/* The picture                                                           */
/* -------------------------------------------------------------------- */

export type AvatarOutcome =
  | { ok: true; url: string }
  | { ok: false; reason: "too-big" | "wrong-type" | "unreadable" | "unavailable" };

/**
 * Stores a profile picture.
 *
 * Re-encoded rather than stored as sent, and that is the whole security
 * position of this function. The bucket is public by design — an avatar
 * is shown to a room full of strangers — so anything that lands in it is
 * served to anyone with the URL. Decoding to raw pixels and writing a
 * fresh WebP means the bytes served are ones this server produced:
 * whatever was hiding in the original file's metadata, trailing data or
 * mislabelled container does not survive the round trip.
 *
 * `avatar.ts` next door still generates the initials-and-colour mark,
 * and still does when there is no picture. Its doc comment used to say
 * uploads were deliberately out of scope; the founder has since asked
 * for them, so that note has been corrected rather than left to mislead.
 */
export async function setAvatar(
  playerId: string,
  file: { arrayBuffer(): Promise<ArrayBuffer>; size: number; type: string },
): Promise<AvatarOutcome> {
  if (!isSupabaseConfigured()) return { ok: false, reason: "unavailable" };

  if (file.size > AVATAR_MAX_BYTES) return { ok: false, reason: "too-big" };
  if (!(AVATAR_MIME_TYPES as readonly string[]).includes(file.type)) {
    return { ok: false, reason: "wrong-type" };
  }

  let encoded: Buffer;
  try {
    /*
     * `failOn: "error"` rather than sharp's default, so a truncated or
     * malformed image is refused instead of half-decoded. The centre
     * crop is what makes every avatar the same shape regardless of what
     * came out of a camera roll.
     */
    encoded = await sharp(Buffer.from(await file.arrayBuffer()), { failOn: "error" })
      .rotate()
      .resize(AVATAR_SIZE, AVATAR_SIZE, { fit: "cover", position: "centre" })
      .webp({ quality: 82 })
      .toBuffer();
  } catch (error) {
    console.error("Could not decode the uploaded picture", error);
    return { ok: false, reason: "unreadable" };
  }

  const admin = getSupabaseAdmin();
  const path = avatarObjectPath(playerId);

  const { error: uploadError } = await admin.storage
    .from("avatars")
    .upload(path, encoded, { contentType: "image/webp", upsert: true });

  if (uploadError) {
    console.error("Could not store the profile picture", uploadError);
    return { ok: false, reason: "unavailable" };
  }

  const {
    data: { publicUrl },
  } = admin.storage.from("avatars").getPublicUrl(path);

  const { data: previous, error: readError } = await admin
    .from("players")
    .select("avatar_url")
    .eq("id", playerId)
    .maybeSingle();

  if (readError) console.error("Could not read the previous picture", readError);

  const { error } = await admin
    .from("players")
    .update({ avatar_url: publicUrl })
    .eq("id", playerId);

  if (error) {
    console.error("Could not record the profile picture", error);
    return { ok: false, reason: "unavailable" };
  }

  /*
   * The old object is deleted after the new one is recorded, never
   * before. Losing the delete leaves an orphan nobody can reach; losing
   * the upload after a delete leaves a player with no picture at all.
   */
  await deleteAvatarObject(previous?.avatar_url ?? null);

  return { ok: true, url: publicUrl };
}

/** Removes the picture and goes back to the generated initials. */
export async function clearAvatar(playerId: string): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;

  const admin = getSupabaseAdmin();

  const { data: previous } = await admin
    .from("players")
    .select("avatar_url")
    .eq("id", playerId)
    .maybeSingle();

  const { error } = await admin
    .from("players")
    .update({ avatar_url: null })
    .eq("id", playerId);

  if (error) {
    console.error("Could not clear the profile picture", error);
    return false;
  }

  await deleteAvatarObject(previous?.avatar_url ?? null);
  return true;
}

/**
 * Deletes the stored object behind an avatar URL.
 *
 * Parsed back out of the public URL rather than kept in its own column:
 * one source of truth for where the picture is, and no way for the two
 * to drift. Anything that does not look like this bucket's public URL is
 * ignored, so a hand-edited row cannot aim this at another bucket.
 */
async function deleteAvatarObject(publicUrl: string | null): Promise<void> {
  if (!publicUrl) return;

  const marker = "/storage/v1/object/public/avatars/";
  const at = publicUrl.indexOf(marker);
  if (at === -1) return;

  const path = decodeURIComponent(publicUrl.slice(at + marker.length));
  if (!path || path.includes("..")) return;

  const { error } = await getSupabaseAdmin().storage.from("avatars").remove([path]);
  if (error) console.error("Could not delete the old profile picture", error);
}

/** Renames the account. The display name a room shows comes from here. */
export async function setDisplayName(
  playerId: string,
  displayName: string,
): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;

  const { error } = await getSupabaseAdmin()
    .from("players")
    .update({ display_name: displayName })
    .eq("id", playerId);

  if (error) {
    console.error("Could not rename the player", error);
    return false;
  }

  return true;
}
