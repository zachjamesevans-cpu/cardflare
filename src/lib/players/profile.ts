import "server-only";

import sharp from "sharp";

import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";
import { freeSlugFor, ownedCosmetics, ownsCosmetic, type Equipped } from "./cosmetics";
import {
  AVATAR_MAX_BYTES,
  AVATAR_MIME_TYPES,
  AVATAR_SIZE,
  avatarObjectPath,
  avatarSrc,
  coverObjectPath,
  COVER_HEIGHT,
  COVER_WIDTH,
  objectPathFrom,
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
  /** This card's own dressing, or null to wear the profile's default. */
  frame: string | null;
  holo: string | null;
}

export interface PublicProfile {
  playerId: string;
  displayName: string;
  /** Ready to put in an `<img>`. Null means the generated initials. */
  avatarUrl: string | null;
  /** The banner behind the picture, ready for an `<img>`. */
  coverUrl: string | null;
  /** Lifetime. The badge. */
  embersEarned: number;
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
    /*
     * Resolved to a src here rather than at every render point, and
     * VERIFIED against storage — see `verifiedAvatar`. This is the page
     * where a row pointing at a missing object turns into "your picture
     * saved but could not be loaded", which is the worst state the
     * profile has: a message with nothing anybody can do about it.
     */
    avatarUrl: await verifiedAvatar(playerId, player.avatar_url),
    coverUrl: avatarSrc(player.cover_image),
    embersEarned: player.embers_earned,
    embersBalance: player.embers_balance,
    equipped: {
      avatarFrame: player.equipped_avatar_frame,
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
 * The avatar src, only if the object actually exists.
 *
 * A row can point at nothing: earlier rounds of this feature deleted
 * objects on some failure paths while the row kept its value, and a
 * stale row is a picture that "tries to load for a second" and then
 * falls back — the founder's exact report, twice. Rather than trusting
 * the column, this asks storage whether the object is there, and when it
 * is not it CLEARS the row: the profile then honestly shows initials
 * and a fresh upload starts clean, instead of a warning nobody can act
 * on rendering forever.
 *
 * One `list` call scoped to the player's own folder, on the own-profile
 * read only. Room rosters skip it — dozens of rows per render, and a
 * broken image there already falls back to initials silently.
 */
async function verifiedAvatar(
  playerId: string,
  stored: string | null,
): Promise<string | null> {
  if (!stored) return null;

  const path = objectPathFrom(stored);
  if (!path) return null;

  const slash = path.lastIndexOf("/");
  const folder = slash === -1 ? "" : path.slice(0, slash);
  const filename = slash === -1 ? path : path.slice(slash + 1);

  const { data, error } = await getSupabaseAdmin()
    .storage.from("avatars")
    .list(folder, { search: filename });

  if (error) {
    /*
     * Cannot tell, so do not judge: return the src and let the client's
     * own fallback handle a failure. Clearing a good row over a storage
     * blip would delete somebody's picture for nothing.
     */
    console.error("Could not verify the profile picture exists", error);
    return avatarSrc(stored);
  }

  const exists = (data ?? []).some((object) => object.name === filename);
  if (exists) return avatarSrc(stored);

  console.error(
    `Avatar row for player ${playerId} points at a missing object (${path}); clearing it.`,
  );

  await getSupabaseAdmin()
    .from("players")
    .update({ avatar_url: null })
    .eq("id", playerId);

  return null;
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

/**
 * What a room needs to know about a player, beside their name.
 *
 * One map for both facts because they come from the same row and are
 * shown in the same place — a picture and a badge next to a name. Two
 * separate lookups would be two chances for a roster to show one and not
 * the other.
 *
 * Lifetime Embers only. There is deliberately no balance here: this
 * feeds the most public surface in the product, and the type it returns
 * has nowhere to put one.
 */
export interface RoomIdentity {
  embersEarned: number;
  avatarUrl: string | null;
  /**
   * The frame slug they are wearing, already resolved through the
   * catalogue so a null column reads as the free default rather than
   * making every renderer know the free-is-implicit rule.
   */
  frame: string | null;
}

export async function roomIdentitiesFor(
  playerIds: string[],
): Promise<Map<string, RoomIdentity>> {
  const identities = new Map<string, RoomIdentity>();
  if (!isSupabaseConfigured() || playerIds.length === 0) return identities;

  const { data, error } = await getSupabaseAdmin()
    .from("players")
    .select("id, embers_earned, avatar_url, equipped_avatar_frame")
    .in("id", [...new Set(playerIds)]);

  if (error) {
    console.error("Could not read player identities for a room", error);
    return identities;
  }

  /*
   * The free frame, looked up once for the whole room rather than per
   * person. A null slot means "the free one", and resolving it here
   * keeps that rule in the same file as the rest of it. This is the
   * AVATAR frame slot: rooms only ever draw the ring around a person,
   * and the founder split that choice from the card borders.
   */
  const freeFrame = await freeSlugFor("frame");

  for (const row of data ?? []) {
    identities.set(row.id, {
      embersEarned: row.embers_earned,
      avatarUrl: avatarSrc(row.avatar_url),
      frame: row.equipped_avatar_frame ?? freeFrame,
    });
  }

  return identities;
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
    .select("id, card_id, printing_id, position, frame_slug, holo_slug")
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
      frame: row.frame_slug,
      holo: row.holo_slug,
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
/**
 * A slug this player may actually wear: in the catalogue, the right
 * kind, and owned (bought, free, or granted). Anything else resolves to
 * null — the card falls back to the profile default rather than the
 * write failing, and a crafted POST cannot dress a card in something
 * unbought.
 */
async function wearableOrNull(
  playerId: string,
  slug: string | null,
  kind: "frame" | "holo",
): Promise<string | null> {
  if (!slug) return null;

  const { data: item } = await getSupabaseAdmin()
    .from("cosmetics")
    .select("slug, kind, cost_embers, status")
    .eq("slug", slug)
    .maybeSingle();

  if (!item || item.kind !== kind) return null;
  return ownsCosmetic(item, await ownedCosmetics(playerId)) ? slug : null;
}

export async function addToShowcase(
  playerId: string,
  cardId: string,
  printingId: string | null,
  /** The dressing chosen at add time, before the card ever shows. */
  dressing?: { frame: string | null; holo: string | null },
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

  const [frame, holo] = await Promise.all([
    wearableOrNull(playerId, dressing?.frame ?? null, "frame"),
    wearableOrNull(playerId, dressing?.holo ?? null, "holo"),
  ]);

  const { error } = await admin.from("player_showcase").insert({
    player_id: playerId,
    card_id: cardId,
    printing_id: printingId,
    position: count ?? 0,
    frame_slug: frame,
    holo_slug: holo,
  });

  if (error) {
    // The unique index means it is already up there, which is not a failure.
    if (error.code === "23505") return { ok: false, reason: "duplicate" };
    console.error("Could not add to the showcase", error);
    return { ok: false, reason: "unavailable" };
  }

  return { ok: true };
}

/**
 * Dresses one showcase card: its own frame and holo, explicitly.
 *
 * Scoped to the owner in the WHERE clause, so an entry id fished out of
 * someone else's page updates nothing. Both slots are written every
 * time — the editor always knows the full pair it is showing, and a
 * partial write is how two surfaces end up disagreeing about one card.
 */
export async function dressShowcaseCard(
  playerId: string,
  entryId: string,
  frame: string | null,
  holo: string | null,
): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;

  const [wearableFrame, wearableHolo] = await Promise.all([
    wearableOrNull(playerId, frame, "frame"),
    wearableOrNull(playerId, holo, "holo"),
  ]);

  const { error } = await getSupabaseAdmin()
    .from("player_showcase")
    .update({ frame_slug: wearableFrame, holo_slug: wearableHolo })
    .eq("id", entryId)
    .eq("player_id", playerId);

  if (error) {
    console.error("Could not dress the showcase card", error);
    return false;
  }

  return true;
}

/**
 * The "Apply to all" button: this dressing becomes the profile default,
 * and every card's own override is cleared so all of them inherit it.
 *
 * Clearing the overrides rather than stamping the slugs onto every row
 * is the difference between "make them all match now" and "freeze them
 * all forever": after this, changing the default in the store changes
 * the whole shelf again, which is what a default is for.
 */
export async function dressAllShowcase(
  playerId: string,
  frame: string | null,
  holo: string | null,
): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;

  const admin = getSupabaseAdmin();

  const [wearableFrame, wearableHolo] = await Promise.all([
    wearableOrNull(playerId, frame, "frame"),
    wearableOrNull(playerId, holo, "holo"),
  ]);

  const [defaults, overrides] = await Promise.all([
    admin
      .from("players")
      .update({ equipped_frame: wearableFrame, equipped_holo: wearableHolo })
      .eq("id", playerId),
    admin
      .from("player_showcase")
      .update({ frame_slug: null, holo_slug: null })
      .eq("player_id", playerId),
  ]);

  if (defaults.error || overrides.error) {
    console.error(
      "Could not apply the dressing to all cards",
      defaults.error ?? overrides.error,
    );
    return false;
  }

  return true;
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
  | { ok: true; path: string }
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
      /*
       * JPEG, not WebP, and it is load-bearing: WebP was the one
       * constant across every failed render of this feature. See the
       * note on AVATAR_FORMAT.
       */
      .jpeg({ quality: 82 })
      .toBuffer();
  } catch (error) {
    console.error("Could not decode the uploaded picture", error);
    return { ok: false, reason: "unreadable" };
  }

  const admin = getSupabaseAdmin();
  const path = avatarObjectPath(playerId);

  /*
   * Uploaded as a Blob, never as a bare Buffer, and this line is the
   * whole bug that took six rounds to corner. The system check finally
   * decoded what the bucket actually held: bytes beginning
   * efbfbd-efbfbd-efbfbd — the UTF-8 replacement character, repeated.
   * That is the fingerprint of binary data coerced through a text
   * string: somewhere in the deployed runtime's fetch, a Buffer body
   * was read as UTF-8 and every non-text byte became "\\uFFFD", leaving
   * a plausibly-sized, correctly-labelled object that no browser could
   * ever decode. A Blob carries its binary nature in its type; nothing
   * in any fetch implementation coerces one through text.
   *
   * The readback below stays even so. If any runtime ever mangles a
   * Blob too, the write refuses instead of recording garbage.
   */
  const { error: uploadError } = await admin.storage
    .from("avatars")
    .upload(path, new Blob([new Uint8Array(encoded)], { type: "image/jpeg" }), {
      contentType: "image/jpeg",
      upsert: true,
    });

  if (uploadError) {
    console.error("Could not store the profile picture", uploadError);
    return { ok: false, reason: "unavailable" };
  }

  /*
   * Read back and byte-compare before recording anything.
   *
   * This write went five rounds looking healthy while the founder's
   * phone showed initials, because every check compared labels and
   * sizes and nothing ever proved the bucket holds the bytes sharp
   * produced. Now the write proves itself: download what just landed
   * and compare it to what was sent. A mismatch deletes the object and
   * refuses loudly, instead of recording a row that renders as a broken
   * circle on somebody's phone.
   */
  const { data: readBack, error: verifyError } = await admin.storage
    .from("avatars")
    .download(path);

  const landed = readBack ? Buffer.from(await readBack.arrayBuffer()) : null;

  if (verifyError || !landed || !landed.equals(encoded)) {
    console.error(
      `Avatar readback mismatch for ${path}: sent ${encoded.length} bytes, ` +
        `read ${landed?.length ?? "none"} back${verifyError ? ` (${verifyError.message})` : ""}.`,
    );
    await admin.storage.from("avatars").remove([path]);
    return { ok: false, reason: "unavailable" };
  }

  /*
   * The object PATH is what gets stored, not a public URL.
   *
   * The previous cut stored `getPublicUrl(path)` and pointed an `<img>`
   * at the storage host. That is what the founder saw fail: the server
   * could fetch the URL and their phone could not. Storing a path and
   * serving through `/api/avatars/...` means the browser only ever talks
   * to CardFlare, and it takes "is the bucket public" out of the
   * equation entirely — this row is now correct either way.
   */
  const { data: previous, error: readError } = await admin
    .from("players")
    .select("avatar_url")
    .eq("id", playerId)
    .maybeSingle();

  if (readError) console.error("Could not read the previous picture", readError);

  const { error } = await admin
    .from("players")
    .update({ avatar_url: path })
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

  return { ok: true, path };
}

/**
 * Stores a cover banner: the avatar pipeline, wide.
 *
 * Same decode discipline (failOn error), same JPEG-only rule, same
 * Blob-not-Buffer upload, same store-the-path decision. The crop to
 * 1200x450 is what makes "rounded edges, cropped automatically" true:
 * whatever shape arrives, the stored object is exactly the banner box.
 */
export async function setCover(
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
    encoded = await sharp(Buffer.from(await file.arrayBuffer()), { failOn: "error" })
      .rotate()
      .resize(COVER_WIDTH, COVER_HEIGHT, { fit: "cover", position: "centre" })
      .jpeg({ quality: 80 })
      .toBuffer();
  } catch (error) {
    console.error("Could not decode the uploaded cover", error);
    return { ok: false, reason: "unreadable" };
  }

  const admin = getSupabaseAdmin();
  const path = coverObjectPath(playerId);

  const { error: uploadError } = await admin.storage
    .from("avatars")
    .upload(path, new Blob([new Uint8Array(encoded)], { type: "image/jpeg" }), {
      contentType: "image/jpeg",
      upsert: false,
    });

  if (uploadError) {
    console.error("Could not store the cover", uploadError);
    return { ok: false, reason: "unavailable" };
  }

  const { data: previous } = await admin
    .from("players")
    .select("cover_image")
    .eq("id", playerId)
    .maybeSingle();

  const { error } = await admin
    .from("players")
    .update({ cover_image: path })
    .eq("id", playerId);

  if (error) {
    console.error("Could not record the cover", error);
    return { ok: false, reason: "unavailable" };
  }

  const old = objectPathFrom(previous?.cover_image ?? null);
  if (old)
    await admin.storage
      .from("avatars")
      .remove([old])
      .catch(() => {});

  return { ok: true, path };
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
 * Deletes the stored object behind an avatar row.
 *
 * Both column shapes are handled by `objectPathFrom` — a bare path for
 * rows written since the proxy landed, a full public URL for older ones.
 * Shared with `avatarSrc` deliberately: two functions parsing the same
 * column two ways is how they end up disagreeing about which object a
 * row points at.
 */
async function deleteAvatarObject(stored: string | null): Promise<void> {
  const path = objectPathFrom(stored);
  if (!path) return;

  const { error } = await getSupabaseAdmin().storage.from("avatars").remove([path]);
  if (error) console.error("Could not delete the old profile picture", error);
}

/**
 * Records that a player has finished setting themselves up.
 *
 * Idempotent by `is null`: running it twice must not rewrite the date,
 * because "when did they sign up" is a question the column answers and a
 * second write would lose the answer.
 */
export async function markOnboarded(playerId: string): Promise<void> {
  if (!isSupabaseConfigured()) return;

  const { error } = await getSupabaseAdmin()
    .from("players")
    .update({ onboarded_at: new Date().toISOString() })
    .eq("id", playerId)
    .is("onboarded_at", null);

  if (error) console.error("Could not mark the player as set up", error);

  /* The welcome gift: one sealed Origin pack, exactly once. Granted at
     the end of setup so the first thing a finished profile owns is
     something to open. */
  const { grantSignupPackOnce } = await import("@/lib/packs/repository");
  await grantSignupPackOnce(playerId);
}

/** Has this player chosen a username yet? */
export async function needsSetup(playerId: string): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;

  const { data, error } = await getSupabaseAdmin()
    .from("players")
    .select("onboarded_at")
    .eq("id", playerId)
    .maybeSingle();

  if (error) {
    console.error("Could not check whether setup is owed", error);
    /* Say no. Trapping somebody in a wizard because of a failed read is
       far worse than letting them use an account they already set up. */
    return false;
  }

  return data ? data.onboarded_at === null : false;
}

export type RenameOutcome = "renamed" | "taken" | "failed";

/** Postgres unique violation: somebody already has that name. */
const UNIQUE_VIOLATION = "23505";

/**
 * Renames the account, if the name is free.
 *
 * Availability is decided by the unique index, not by a SELECT before
 * the UPDATE. Two people can type the same name into two phones at the
 * same counter, and a check-then-write loses that race every time — the
 * index is the only thing that cannot.
 *
 * The name is also written through to every session the account owns.
 * Rooms render `player_sessions.display_name`, and a copy that is never
 * refreshed is a copy that drifts: rename yourself mid-event and the
 * board would keep showing whatever you were called when you walked in.
 * Write-through rather than a join in every name lookup because there
 * are five of those and one of these.
 */
export async function setDisplayName(
  playerId: string,
  displayName: string,
): Promise<RenameOutcome> {
  if (!isSupabaseConfigured()) return "failed";

  const admin = getSupabaseAdmin();
  const name = displayName.trim();

  const { error } = await admin
    .from("players")
    .update({ display_name: name })
    .eq("id", playerId);

  if (error) {
    if (error.code === UNIQUE_VIOLATION) return "taken";
    console.error("Could not rename the player", error);
    return "failed";
  }

  await syncSessionNames(playerId, name);
  return "renamed";
}

/**
 * Points every room identity this account owns at the account's name.
 *
 * Failure is logged and swallowed: the rename itself already succeeded,
 * and a stale name in one room is not worth telling somebody their
 * rename did not work when it did.
 */
export async function syncSessionNames(
  playerId: string,
  displayName: string,
): Promise<void> {
  if (!isSupabaseConfigured()) return;

  const { error } = await getSupabaseAdmin()
    .from("player_sessions")
    .update({ display_name: displayName })
    .eq("player_id", playerId);

  if (error) console.error("Could not sync the name onto the player's sessions", error);
}

/**
 * Is this name free, ignoring case?
 *
 * A courtesy for the UI, never the gate — see `setDisplayName`. The
 * `ilike` is an exact comparison with no wildcards in it: the pattern is
 * escaped, so a name containing `%` matches only itself.
 */
export async function isDisplayNameFree(
  displayName: string,
  exceptPlayerId?: string,
): Promise<boolean> {
  if (!isSupabaseConfigured()) return true;

  const pattern = displayName.trim().replace(/([%_\\])/g, "\\$1");

  let query = getSupabaseAdmin()
    .from("players")
    .select("id")
    .ilike("display_name", pattern);
  if (exceptPlayerId) query = query.neq("id", exceptPlayerId);

  const { data, error } = await query.limit(1);

  if (error) {
    console.error("Could not check whether a name is free", error);
    // Say yes and let the index decide; a false "taken" blocks a valid name.
    return true;
  }

  return (data ?? []).length === 0;
}
