"use server";

import { revalidatePath } from "next/cache";

import { getViewer } from "@/lib/auth/session";
import { text } from "@/lib/form-value";
import { deleteCosmetic, setCosmeticStatus } from "./catalog";
import {
  createPackSet,
  deletePackSet,
  putPackSetItem,
  removePackSetItem,
  setPackSetStatus,
  updatePackSet,
} from "./pack-sets";
import {
  cosmeticStatusSchema,
  deleteCosmeticSchema,
  packSetEditSchema,
  packSetItemRefSchema,
  packSetItemSchema,
  packSetRefSchema,
  packSetSchema,
  packSetStatusSchema,
  type CatalogState,
} from "./catalog-schema";

/**
 * Curating the catalogue and building sets, from the console.
 *
 * Every one re-establishes admin from scratch: a Server Action is a
 * public POST endpoint, and these write to what every player can see.
 * A refused call says nothing specific, the same as the record editor.
 */

const GENERIC_ERROR = "Something went wrong. Please try again in a moment.";
const REFUSED: CatalogState = { status: "error", message: GENERIC_ERROR };

async function isAdmin(): Promise<boolean> {
  return (await getViewer()).kind === "admin";
}

function refresh() {
  revalidatePath("/admin/packs");
  /* The store reads the catalogue, so a status flip changes it too. */
  revalidatePath("/profile/store");
}

/** Turns the console's local date-time string into an instant, or null. */
function instantOrNull(typed: string): string | null {
  if (!typed) return null;
  const parsed = new Date(typed);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

export async function setCosmeticStatusAction(
  _previous: CatalogState,
  formData: FormData,
): Promise<CatalogState> {
  if (!(await isAdmin())) return REFUSED;

  const parsed = cosmeticStatusSchema.safeParse({
    slug: text(formData, "slug"),
    status: text(formData, "status"),
  });
  if (!parsed.success) return REFUSED;

  const saved = await setCosmeticStatus(parsed.data.slug, parsed.data.status);
  if (!saved) return { status: "error", message: GENERIC_ERROR };

  refresh();
  return {
    status: "done",
    message:
      parsed.data.status === "live"
        ? "Live. Players can see it now."
        : "Back behind the scenes.",
  };
}

export async function deleteCosmeticAction(
  _previous: CatalogState,
  formData: FormData,
): Promise<CatalogState> {
  if (!(await isAdmin())) return REFUSED;

  const parsed = deleteCosmeticSchema.safeParse({ slug: text(formData, "slug") });
  if (!parsed.success) return REFUSED;

  const outcome = await deleteCosmetic(parsed.data.slug);

  if (outcome === "owned") {
    return {
      status: "error",
      message:
        "Somebody owns this one, so it stays. Set it back to draft if you want it out of the shop.",
    };
  }
  if (outcome === "missing") return { status: "error", message: "Already gone." };
  if (outcome === "failed") return { status: "error", message: GENERIC_ERROR };

  refresh();
  return { status: "done", message: "Deleted for good." };
}

export async function createPackSetAction(
  _previous: CatalogState,
  formData: FormData,
): Promise<CatalogState> {
  if (!(await isAdmin())) return REFUSED;

  const parsed = packSetSchema.safeParse({
    slug: text(formData, "slug"),
    name: text(formData, "name"),
    setNumber: text(formData, "setNumber"),
    description: text(formData, "description"),
    priceEmbers: text(formData, "priceEmbers"),
    slots: text(formData, "slots"),
    releaseAt: text(formData, "releaseAt"),
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? GENERIC_ERROR,
    };
  }

  const made = await createPackSet({
    ...parsed.data,
    releaseAt: instantOrNull(parsed.data.releaseAt),
  });

  if (!made) {
    return {
      status: "error",
      message: "Could not create it. That set number or slug may already be taken.",
    };
  }

  refresh();
  return { status: "done", message: `${parsed.data.name} created, as a draft.` };
}

export async function updatePackSetAction(
  _previous: CatalogState,
  formData: FormData,
): Promise<CatalogState> {
  if (!(await isAdmin())) return REFUSED;

  const ref = packSetRefSchema.safeParse({ seriesSlug: text(formData, "seriesSlug") });
  const parsed = packSetEditSchema.safeParse({
    name: text(formData, "name"),
    description: text(formData, "description"),
    priceEmbers: text(formData, "priceEmbers"),
    slots: text(formData, "slots"),
    releaseAt: text(formData, "releaseAt"),
  });

  if (!ref.success || !parsed.success) {
    return {
      status: "error",
      message: parsed.success
        ? GENERIC_ERROR
        : (parsed.error.issues[0]?.message ?? GENERIC_ERROR),
    };
  }

  const saved = await updatePackSet(ref.data.seriesSlug, {
    ...parsed.data,
    releaseAt: instantOrNull(parsed.data.releaseAt),
  });
  if (!saved) return { status: "error", message: GENERIC_ERROR };

  refresh();
  return { status: "done", message: "Saved." };
}

export async function deletePackSetAction(
  _previous: CatalogState,
  formData: FormData,
): Promise<CatalogState> {
  if (!(await isAdmin())) return REFUSED;

  const parsed = packSetRefSchema.safeParse({
    seriesSlug: text(formData, "seriesSlug"),
  });
  if (!parsed.success) return REFUSED;

  const gone = await deletePackSet(parsed.data.seriesSlug);
  if (!gone) return { status: "error", message: GENERIC_ERROR };

  refresh();
  return { status: "done", message: "Set deleted. The cosmetics in it are untouched." };
}

export async function putPackSetItemAction(
  _previous: CatalogState,
  formData: FormData,
): Promise<CatalogState> {
  if (!(await isAdmin())) return REFUSED;

  const parsed = packSetItemSchema.safeParse({
    seriesSlug: text(formData, "seriesSlug"),
    cosmeticSlug: text(formData, "cosmeticSlug"),
    rarity: text(formData, "rarity"),
    weight: text(formData, "weight"),
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? GENERIC_ERROR,
    };
  }

  const put = await putPackSetItem(
    parsed.data.seriesSlug,
    parsed.data.cosmeticSlug,
    parsed.data.rarity,
    parsed.data.weight,
  );
  if (!put) return { status: "error", message: GENERIC_ERROR };

  refresh();
  return { status: "done", message: "In the set." };
}

export async function removePackSetItemAction(
  _previous: CatalogState,
  formData: FormData,
): Promise<CatalogState> {
  if (!(await isAdmin())) return REFUSED;

  const parsed = packSetItemRefSchema.safeParse({
    seriesSlug: text(formData, "seriesSlug"),
    cosmeticSlug: text(formData, "cosmeticSlug"),
  });
  if (!parsed.success) return REFUSED;

  const gone = await removePackSetItem(
    parsed.data.seriesSlug,
    parsed.data.cosmeticSlug,
  );
  if (!gone) return { status: "error", message: GENERIC_ERROR };

  refresh();
  return { status: "done", message: "Taken out of the set." };
}

export async function setPackSetStatusAction(
  _previous: CatalogState,
  formData: FormData,
): Promise<CatalogState> {
  if (!(await isAdmin())) return REFUSED;

  const parsed = packSetStatusSchema.safeParse({
    seriesSlug: text(formData, "seriesSlug"),
    status: text(formData, "status"),
  });
  if (!parsed.success) return REFUSED;

  const outcome = await setPackSetStatus(parsed.data.seriesSlug, parsed.data.status);

  /* Each refusal names the one thing standing in the way, because
     "could not publish" sends somebody hunting through a long list. */
  if (outcome === "weights") {
    return {
      status: "error",
      message: "The weights have to add up to exactly 100 before this can go live.",
    };
  }
  if (outcome === "empty") {
    return {
      status: "error",
      message:
        "A pack cannot repeat an item, so the set needs at least as many items as it has slots.",
    };
  }
  if (outcome === "drafts") {
    return {
      status: "error",
      message:
        "Some items in this set are still behind the scenes. Set those live first, or take them out.",
    };
  }
  if (outcome === "failed") return { status: "error", message: GENERIC_ERROR };

  refresh();
  return {
    status: "done",
    message:
      outcome === "published"
        ? "Live. It shows in the Embers store from its release date."
        : "Taken off sale.",
  };
}
