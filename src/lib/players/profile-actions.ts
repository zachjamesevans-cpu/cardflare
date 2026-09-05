"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getViewer, type Viewer } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { deleteAccount } from "@/lib/players/delete-account";
import { text } from "@/lib/form-value";
import { checkRateLimit } from "@/lib/rate-limit";
import { clientKey } from "@/lib/request-context";
import { playerForUser } from "./accounts";
import { buyCosmetic, type EquipSlot } from "./cosmetics";
import {
  addToShowcase,
  clearAvatar,
  dressAllShowcase,
  dressShowcaseCard,
  removeFromShowcase,
  setAnimatedAvatar,
  setAvatar,
  setCover,
  setDisplayName,
  setHandle,
} from "./profile";
import { handleSchema } from "./handle";
import {
  ANIMATED_AVATAR_MAX_BYTES,
  ANIMATED_AVATAR_MIME_TYPES,
  AVATAR_MAX_BYTES,
  AVATAR_MIME_TYPES,
} from "./profile-image";
import {
  BUY_REFUSALS,
  displayNameSchema,
  type ProfileState,
  type ShopState,
} from "./profile-schema";

/**
 * Everything a player can change about their own profile.
 *
 * Every action here re-derives the player from the session rather than
 * taking an id from the form, because a Server Action is a public POST
 * endpoint and a player id in a hidden input is a suggestion, not a
 * fact. There is deliberately no "edit someone else's profile" path at
 * all, not even an admin one: the founder is the only admin, and a
 * capability nobody needs is a capability nobody can misuse.
 */

const GENERIC_ERROR = "Something went wrong. Please try again in a moment.";

/**
 * The player behind whoever is signed in, whatever else they are — the
 * founder is an admin with a player account, and both halves work at
 * once. Same helper as `account-actions.ts`, same reason.
 */
async function playerIdFor(viewer: Viewer): Promise<string | null> {
  if (viewer.kind === "anonymous") return null;
  if (viewer.kind === "player") return viewer.playerId;
  return (await playerForUser(viewer.user.id))?.id ?? null;
}

/** The profile is on two paths now, and both should repaint. */
function revalidateProfile(): void {
  revalidatePath("/profile");
  revalidatePath("/profile/settings");
}

export async function renameProfileAction(
  _previous: ProfileState,
  formData: FormData,
): Promise<ProfileState> {
  const playerId = await playerIdFor(await getViewer());
  if (!playerId) return { status: "error", message: GENERIC_ERROR };

  const parsed = displayNameSchema.safeParse({
    displayName: text(formData, "displayName"),
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? GENERIC_ERROR,
    };
  }

  /* No "taken" branch any more: names stopped needing to be unique the
     day handles arrived, and the handle is what carries the identity. */
  const outcome = await setDisplayName(playerId, parsed.data.displayName);
  if (outcome === "failed") return { status: "error", message: GENERIC_ERROR };

  /*
   * The rooms too, not just the profile. The name was written through to
   * every session this account owns, so any board they are on is now
   * showing something different from what is cached.
   */
  revalidateProfile();
  revalidatePath("/room");
  revalidatePath("/flare");

  return { status: "saved", message: "Name updated." };
}

/*
 * Uploads are rate-limited where nothing else on this page is, because
 * this is the one action that costs real work: decoding an image,
 * resizing it and writing it to storage. Six an hour is more changes of
 * mind than anyone needs and far fewer than it takes to be a nuisance.
 */
const AVATAR_MAX = 6;
const AVATAR_WINDOW_MS = 60 * 60 * 1000;

export async function setAvatarAction(
  _previous: ProfileState,
  formData: FormData,
): Promise<ProfileState> {
  const playerId = await playerIdFor(await getViewer());
  if (!playerId) return { status: "error", message: GENERIC_ERROR };

  const rate = checkRateLimit(
    `avatar:${await clientKey()}`,
    AVATAR_MAX,
    AVATAR_WINDOW_MS,
  );
  if (!rate.allowed) {
    return {
      status: "error",
      message: "That is a lot of new pictures. Try again in a little while.",
    };
  }

  const file = formData.get("avatar");

  if (!(file instanceof File) || file.size === 0) {
    return { status: "error", message: "Pick a picture to upload." };
  }

  /*
   * Re-checked here even though the client checked: the client's check
   * is a courtesy that saves a doomed upload, and this one is the rule.
   */
  if (file.size > AVATAR_MAX_BYTES) {
    return {
      status: "error",
      message: "That picture is over 2MB. Pick a smaller one.",
    };
  }
  if (!(AVATAR_MIME_TYPES as readonly string[]).includes(file.type)) {
    return {
      status: "error",
      message: "Profile pictures need to be a PNG, JPEG or WebP.",
    };
  }

  const outcome = await setAvatar(playerId, file);

  if (!outcome.ok) {
    return {
      status: "error",
      message:
        outcome.reason === "unreadable"
          ? "That file could not be read as a picture. Try another one."
          : outcome.reason === "too-big"
            ? "That picture is over 2MB. Pick a smaller one."
            : outcome.reason === "wrong-type"
              ? "Profile pictures need to be a PNG, JPEG or WebP."
              : GENERIC_ERROR,
    };
  }

  revalidateProfile();
  return { status: "saved", message: "Picture updated." };
}

/**
 * An animated profile picture: the Pro feature.
 *
 * Its own action rather than a branch inside `setAvatarAction`,
 * because almost nothing about it is the same: a different ceiling, a
 * different type, a tier to satisfy, and two objects written instead
 * of one. Sharing the entry point would have meant a function whose
 * every line asked which kind of upload this was.
 *
 * The rate limit is deliberately the SAME bucket as the still picture.
 * They are the same act from a player's side, and two buckets would
 * let somebody alternate between them to double their allowance.
 */
export async function setAnimatedAvatarAction(
  _previous: ProfileState,
  formData: FormData,
): Promise<ProfileState> {
  const playerId = await playerIdFor(await getViewer());
  if (!playerId) return { status: "error", message: GENERIC_ERROR };

  const rate = checkRateLimit(
    `avatar:${await clientKey()}`,
    AVATAR_MAX,
    AVATAR_WINDOW_MS,
  );
  if (!rate.allowed) {
    return {
      status: "error",
      message: "That is a lot of new pictures. Try again in a little while.",
    };
  }

  const file = formData.get("avatar");

  if (!(file instanceof File) || file.size === 0) {
    return { status: "error", message: "Pick a GIF to upload." };
  }

  if (file.size > ANIMATED_AVATAR_MAX_BYTES) {
    return { status: "error", message: "That GIF is over 8MB. Pick a smaller one." };
  }
  if (!(ANIMATED_AVATAR_MIME_TYPES as readonly string[]).includes(file.type)) {
    return { status: "error", message: "An animated picture has to be a GIF." };
  }

  const outcome = await setAnimatedAvatar(playerId, file);

  if (!outcome.ok) {
    return {
      status: "error",
      message:
        outcome.reason === "not-pro"
          ? "Animated pictures are a Pro feature."
          : outcome.reason === "unreadable"
            ? "That file could not be read as a GIF. Try another one."
            : outcome.reason === "too-big"
              ? "That GIF is too heavy once it is squared up. Try a shorter loop."
              : outcome.reason === "wrong-type"
                ? "An animated picture has to be a GIF."
                : GENERIC_ERROR,
    };
  }

  revalidateProfile();
  return {
    status: "saved",
    message: `Picture updated. ${outcome.frames} frames, looping.`,
  };
}

/** The cover banner: same rules and rate as the picture, its own field. */
export async function setCoverAction(
  _previous: ProfileState,
  formData: FormData,
): Promise<ProfileState> {
  const playerId = await playerIdFor(await getViewer());
  if (!playerId) return { status: "error", message: GENERIC_ERROR };

  const rate = checkRateLimit(
    `avatar:${await clientKey()}`,
    AVATAR_MAX,
    AVATAR_WINDOW_MS,
  );
  if (!rate.allowed) {
    return {
      status: "error",
      message: "That is a lot of new pictures. Try again in a little while.",
    };
  }

  const file = formData.get("cover");
  if (!(file instanceof File) || file.size === 0) {
    return { status: "error", message: "Pick a picture to upload." };
  }
  if (file.size > AVATAR_MAX_BYTES) {
    return {
      status: "error",
      message: "That picture is over 2MB. Pick a smaller one.",
    };
  }
  if (!(AVATAR_MIME_TYPES as readonly string[]).includes(file.type)) {
    return { status: "error", message: "Covers need to be a PNG, JPEG or WebP." };
  }

  const outcome = await setCover(playerId, file);
  if (!outcome.ok) {
    return {
      status: "error",
      message:
        outcome.reason === "unreadable"
          ? "That file could not be read as a picture. Try another one."
          : "The cover could not be saved. Try again in a moment.",
    };
  }

  revalidateProfile();
  return { status: "saved", message: "Cover updated." };
}

export async function clearAvatarAction(): Promise<void> {
  const playerId = await playerIdFor(await getViewer());
  if (!playerId) return;

  await clearAvatar(playerId);
  revalidateProfile();
}

/**
 * Buys a cosmetic, or equips one already owned.
 *
 * One action for both because it is one tap: the shop and the wardrobe
 * are the same screen, and a player tapping an item they own means
 * "wear this". `buyCosmetic` sorts out which it was.
 */
export async function buyCosmeticAction(
  _previous: ShopState,
  formData: FormData,
): Promise<ShopState> {
  const playerId = await playerIdFor(await getViewer());
  if (!playerId) return { status: "error", message: GENERIC_ERROR };

  const slug = text(formData, "slug");
  const name = text(formData, "name") || "That item";
  if (!slug) return { status: "error", message: GENERIC_ERROR };

  /*
   * Which slot the tap came from. Checked against the four real slots
   * rather than trusted: this is a public POST endpoint, and an
   * unrecognised value falls back to the kind's own slot inside
   * `buyCosmetic` instead of writing anywhere surprising.
   */
  const slotValue = text(formData, "slot");
  const slot: EquipSlot | undefined =
    slotValue === "avatarFrame" ||
    slotValue === "cardFrame" ||
    slotValue === "holo" ||
    slotValue === "effect"
      ? slotValue
      : undefined;

  const outcome = await buyCosmetic(playerId, slug, slot);

  if (!outcome.ok) {
    return { status: "error", message: BUY_REFUSALS[outcome.reason] ?? GENERIC_ERROR };
  }

  revalidateProfile();
  return { status: "bought", name };
}

export async function addShowcaseAction(formData: FormData): Promise<void> {
  const playerId = await playerIdFor(await getViewer());
  if (!playerId) return;

  const cardId = text(formData, "cardId");
  if (!cardId) return;

  await addToShowcase(playerId, cardId, text(formData, "printingId") || null, {
    /*
     * The dressing chosen in the add step. Empty means "the default",
     * and anything not owned resolves to null inside `addToShowcase` -
     * the card still goes up, wearing the default, instead of the add
     * failing over an ornament.
     */
    frame: text(formData, "frame") || null,
    holo: text(formData, "holo") || null,
  });
  revalidateProfile();
}

/** Dresses one showcase card, from the editor behind tapping it. */
export async function dressShowcaseAction(
  _previous: ShopState,
  formData: FormData,
): Promise<ShopState> {
  const playerId = await playerIdFor(await getViewer());
  if (!playerId) return { status: "error", message: GENERIC_ERROR };

  const entryId = text(formData, "entryId");
  if (!entryId) return { status: "error", message: GENERIC_ERROR };

  const done = await dressShowcaseCard(
    playerId,
    entryId,
    text(formData, "frame") || null,
    text(formData, "holo") || null,
  );

  if (!done) return { status: "error", message: GENERIC_ERROR };

  revalidateProfile();
  return { status: "equipped", name: "This card" };
}

/** The editor's Apply to all: default changed, overrides cleared. */
export async function dressAllShowcaseAction(
  _previous: ShopState,
  formData: FormData,
): Promise<ShopState> {
  const playerId = await playerIdFor(await getViewer());
  if (!playerId) return { status: "error", message: GENERIC_ERROR };

  const done = await dressAllShowcase(
    playerId,
    text(formData, "frame") || null,
    text(formData, "holo") || null,
  );

  if (!done) return { status: "error", message: GENERIC_ERROR };

  revalidateProfile();
  return { status: "equipped", name: "Every card" };
}

export async function removeShowcaseAction(formData: FormData): Promise<void> {
  const playerId = await playerIdFor(await getViewer());
  if (!playerId) return;

  const entryId = text(formData, "entryId");
  if (!entryId) return;

  await removeFromShowcase(playerId, entryId);
  revalidateProfile();
}

/**
 * Changing the handle people find you by.
 *
 * Its own action rather than a second field on the rename, because they
 * fail in different ways and for different reasons: a name cannot be
 * refused now, and a handle can. Folding them together would mean one
 * error message trying to explain two unrelated situations.
 */
export async function changeHandleAction(
  _previous: ProfileState,
  formData: FormData,
): Promise<ProfileState> {
  const playerId = await playerIdFor(await getViewer());
  if (!playerId) return { status: "error", message: GENERIC_ERROR };

  const parsed = handleSchema.safeParse({ handle: text(formData, "handle") });

  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? GENERIC_ERROR,
    };
  }

  const outcome = await setHandle(playerId, parsed.data.handle);

  if (outcome === "taken") {
    return { status: "error", message: "That handle is taken. Pick another one." };
  }
  if (outcome === "failed") return { status: "error", message: GENERIC_ERROR };

  revalidateProfile();

  return { status: "saved", message: `You are now @${parsed.data.handle}.` };
}

/**
 * Deleting your own account, from the website.
 *
 * The twin of the app's endpoint, behind the same lock: the handle
 * typed back exactly. On success the session is signed out and the
 * browser lands on the front page, because there is no longer a
 * profile to return to.
 */
export async function deleteAccountAction(
  _previous: ProfileState,
  formData: FormData,
): Promise<ProfileState> {
  const playerId = await playerIdFor(await getViewer());
  if (!playerId) return { status: "error", message: GENERIC_ERROR };

  const outcome = await deleteAccount(playerId, text(formData, "confirmHandle"));
  if (!outcome.ok) return { status: "error", message: outcome.message };

  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/");
}
