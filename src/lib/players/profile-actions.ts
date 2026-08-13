"use server";

import { revalidatePath } from "next/cache";

import { getViewer, type Viewer } from "@/lib/auth/session";
import { text } from "@/lib/form-value";
import { checkRateLimit } from "@/lib/rate-limit";
import { clientKey } from "@/lib/request-context";
import { playerForUser } from "./accounts";
import { buyCosmetic } from "./cosmetics";
import {
  addToShowcase,
  clearAvatar,
  removeFromShowcase,
  setAvatar,
  setDisplayName,
} from "./profile";
import { AVATAR_MAX_BYTES, AVATAR_MIME_TYPES } from "./profile-image";
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

  const saved = await setDisplayName(playerId, parsed.data.displayName);
  if (!saved) return { status: "error", message: GENERIC_ERROR };

  revalidateProfile();
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

  const outcome = await buyCosmetic(playerId, slug);

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

  await addToShowcase(playerId, cardId, text(formData, "printingId") || null);
  revalidateProfile();
}

export async function removeShowcaseAction(formData: FormData): Promise<void> {
  const playerId = await playerIdFor(await getViewer());
  if (!playerId) return;

  const entryId = text(formData, "entryId");
  if (!entryId) return;

  await removeFromShowcase(playerId, entryId);
  revalidateProfile();
}
