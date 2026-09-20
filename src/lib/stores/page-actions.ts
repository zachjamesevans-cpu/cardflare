"use server";

import { revalidatePath } from "next/cache";

import { getViewer } from "@/lib/auth/session";
import { text } from "@/lib/form-value";
import { checkRateLimit } from "@/lib/rate-limit";
import { updateStorePage } from "@/lib/stores/page";
import {
  readHoursFields,
  storePageSchema,
  type StorePageState,
} from "@/lib/stores/page-schema";
import {
  STORE_IMAGE_MAX_BYTES,
  STORE_IMAGE_MIME_TYPES,
} from "@/lib/stores/store-image";
import { clearStoreImage, setStoreImage } from "@/lib/stores/store-images";

const GENERIC_ERROR = "Something went wrong. Please try again in a moment.";

/**
 * Who may change a store's page: its OWNER, and an admin. An organizer
 * is a regular who was handed the timers; the name on the door and the
 * phone number players will ring are not theirs to change. The role is
 * read from the viewer's memberships, which `getViewer` loads with the
 * service role, so a store id posted by anyone else lands here and
 * goes nowhere. Returns the user id, for the rate-limit key.
 */
async function authorizedOwner(storeId: string): Promise<string | null> {
  if (!storeId) return null;
  const viewer = await getViewer();
  const allowed =
    viewer.kind === "admin" ||
    (viewer.kind === "store" && viewer.storeRoles[storeId] === "owner");
  if (!allowed) {
    console.error("Rejected a store page change from an unauthorised viewer.");
    return null;
  }
  return viewer.user.id;
}

/** The page is read on four routes now, and all four should repaint. */
function revalidateStorePage(storeId: string): void {
  revalidatePath("/store");
  revalidatePath("/store/settings");
  revalidatePath("/store/setup");
  revalidatePath(`/s/${storeId}`);
}

/**
 * Saving the store's own page from the console or the wizard.
 *
 * A Server Action is a public POST endpoint, so every field is
 * re-validated by the same schema the form's caps come from.
 */
export async function updateStorePageAction(
  _previous: StorePageState,
  formData: FormData,
): Promise<StorePageState> {
  const storeId = text(formData, "storeId");
  if (!(await authorizedOwner(storeId))) {
    return { status: "error", message: GENERIC_ERROR };
  }

  const parsed = storePageSchema.safeParse({
    name: text(formData, "name"),
    city: text(formData, "city"),
    region: text(formData, "region"),
    addressLine: text(formData, "addressLine"),
    postalCode: text(formData, "postalCode"),
    phone: text(formData, "phone"),
    website: text(formData, "website"),
    description: text(formData, "description"),
    hours: readHoursFields(
      (name) => text(formData, name),
      (name) => formData.has(name),
    ),
    games: formData.getAll("games").filter((value) => typeof value === "string"),
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? GENERIC_ERROR,
    };
  }

  const ok = await updateStorePage(storeId, parsed.data);
  if (!ok) return { status: "error", message: GENERIC_ERROR };

  revalidateStorePage(storeId);

  return { status: "done", message: "Saved. This is what players see now." };
}

/*
 * Pictures are rate-limited where nothing else on this page is, because
 * they are the one action that costs real work: decoding an image,
 * resizing it and writing it to storage. Six an hour per account, the
 * same allowance a player's avatar gets, and one bucket for the logo
 * and the banner together so alternating cannot double it.
 */
const IMAGE_MAX = 6;
const IMAGE_WINDOW_MS = 60 * 60 * 1000;

async function setImage(
  kind: "logo" | "banner",
  formData: FormData,
): Promise<StorePageState> {
  const storeId = text(formData, "storeId");
  const userId = await authorizedOwner(storeId);
  if (!userId) return { status: "error", message: GENERIC_ERROR };

  const rate = checkRateLimit(`store-image:${userId}`, IMAGE_MAX, IMAGE_WINDOW_MS);
  if (!rate.allowed) {
    return {
      status: "error",
      message: "That is a lot of new pictures. Try again in a little while.",
    };
  }

  const file = formData.get(kind);
  if (!(file instanceof File) || file.size === 0) {
    return { status: "error", message: "Pick a picture to upload." };
  }

  /* Re-checked here even though the client checked: the client's check
     is a courtesy that saves a doomed upload, and this one is the rule. */
  if (file.size > STORE_IMAGE_MAX_BYTES) {
    return {
      status: "error",
      message: "That picture is over 2MB. Pick a smaller one.",
    };
  }
  if (!(STORE_IMAGE_MIME_TYPES as readonly string[]).includes(file.type)) {
    return {
      status: "error",
      message: "Pictures need to be a PNG, JPEG or WebP.",
    };
  }

  const outcome = await setStoreImage(storeId, kind, file);
  if (!outcome.ok) {
    return {
      status: "error",
      message:
        outcome.reason === "unreadable"
          ? "That file could not be read as a picture. Try another one."
          : outcome.reason === "too-big"
            ? "That picture is over 2MB. Pick a smaller one."
            : outcome.reason === "wrong-type"
              ? "Pictures need to be a PNG, JPEG or WebP."
              : GENERIC_ERROR,
    };
  }

  revalidateStorePage(storeId);
  return {
    status: "done",
    message: kind === "logo" ? "Logo updated." : "Banner updated.",
  };
}

async function clearImage(
  kind: "logo" | "banner",
  formData: FormData,
): Promise<StorePageState> {
  const storeId = text(formData, "storeId");
  if (!(await authorizedOwner(storeId))) {
    return { status: "error", message: GENERIC_ERROR };
  }

  const ok = await clearStoreImage(storeId, kind);
  if (!ok) return { status: "error", message: GENERIC_ERROR };

  revalidateStorePage(storeId);
  return {
    status: "done",
    message: kind === "logo" ? "Logo removed." : "Banner removed.",
  };
}

/** The logo: a 512 square, cropped in the browser before it is sent. */
export async function setStoreLogoAction(
  _previous: StorePageState,
  formData: FormData,
): Promise<StorePageState> {
  return setImage("logo", formData);
}

/** The banner: the same 1200x900 top-anchored shape a player's cover is. */
export async function setStoreBannerAction(
  _previous: StorePageState,
  formData: FormData,
): Promise<StorePageState> {
  return setImage("banner", formData);
}

export async function clearStoreLogoAction(
  _previous: StorePageState,
  formData: FormData,
): Promise<StorePageState> {
  return clearImage("logo", formData);
}

export async function clearStoreBannerAction(
  _previous: StorePageState,
  formData: FormData,
): Promise<StorePageState> {
  return clearImage("banner", formData);
}
