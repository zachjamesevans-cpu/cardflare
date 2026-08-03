"use server";

import { revalidatePath } from "next/cache";

import { searchCards } from "@/lib/cards/search";
import { cardQuerySchema } from "@/lib/cards/schema";
import { classifyCode, normalizeJoinCode } from "@/lib/events/join-code";
import { findShowByJoinCode } from "@/lib/events/repository";
import { getViewer } from "@/lib/auth/session";
import { text } from "@/lib/form-value";
import { checkRateLimit } from "@/lib/rate-limit";
import { clientKey } from "@/lib/request-context";
import { isSupabaseConfigured, getSupabaseAdmin } from "@/lib/supabase/admin";
import { isValidTimeZone } from "@/lib/time/zone";
import {
  boothSchema,
  createShowSchema,
  inventoryEntrySchema,
  showWindowIn,
  type CreateShowState,
  type InventoryState,
  type ShowSearchResponse,
} from "./schema";
import {
  claimBooth,
  createShow,
  findShowById,
  leaveShow,
  removeInventory,
  showAvailability,
  upsertInventory,
} from "./repository";

const GENERIC_ERROR = "Something went wrong. Please try again in a moment.";

/* -------------------------------------------------------------------------- */
/* Admin: creating a show                                                     */
/* -------------------------------------------------------------------------- */

export async function createShowAction(
  _previous: CreateShowState,
  formData: FormData,
): Promise<CreateShowState> {
  const viewer = await getViewer();

  if (viewer.kind !== "admin") {
    // No detail: an unauthorised caller learns nothing about the action.
    return { status: "error", message: GENERIC_ERROR, fieldErrors: {} };
  }

  const parsed = createShowSchema.safeParse({
    name: text(formData, "name"),
    city: text(formData, "city"),
    region: text(formData, "region"),
  });

  if (!parsed.success) {
    const fieldErrors: CreateShowState["fieldErrors"] = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path[0] as keyof CreateShowState["fieldErrors"];
      if (field && !fieldErrors[field]) fieldErrors[field] = issue.message;
    }
    return {
      status: "error",
      message: "Please fix the highlighted fields.",
      fieldErrors,
    };
  }

  /*
   * The zone comes from the form here — unlike events, a show belongs to no
   * store, so the form is the only place a zone can come from. Validated
   * against Intl, exactly like a store's timezone setting.
   */
  const timezone = text(formData, "timezone") || "UTC";
  if (!isValidTimeZone(timezone)) {
    return {
      status: "error",
      message: "Please pick the show's timezone.",
      fieldErrors: { timezone: "Pick a timezone from the list." },
    };
  }

  const window = showWindowIn(
    text(formData, "startsAt"),
    text(formData, "endsAt"),
    timezone,
  );

  if (!window.ok) {
    return {
      status: "error",
      message: "Please check the show's dates.",
      fieldErrors: { [window.field]: window.message },
    };
  }

  const show = await createShow(
    {
      ...parsed.data,
      timezone,
      startsAt: window.startsAt,
      endsAt: window.endsAt,
    },
    viewer.user.id,
  );

  if (!show) return { status: "error", message: GENERIC_ERROR, fieldErrors: {} };

  revalidatePath("/admin");
  return { status: "created", fieldErrors: {} };
}

/* -------------------------------------------------------------------------- */
/* Vendor: booth and inventory                                                */
/* -------------------------------------------------------------------------- */

/**
 * Whether the current viewer may act as this vendor store.
 *
 * Checked against the membership the server resolved, never the form — and
 * the store must actually be a vendor, so an LGS account cannot wander into
 * inventory it has no dashboard for.
 */
async function authorizeVendor(storeId: string): Promise<boolean> {
  const viewer = await getViewer();

  const allowed =
    viewer.kind === "admin" ||
    (viewer.kind === "store" && viewer.storeIds.includes(storeId));
  if (!allowed || !isSupabaseConfigured()) return false;

  const { data, error } = await getSupabaseAdmin()
    .from("stores")
    .select("kind")
    .eq("id", storeId)
    .maybeSingle();

  if (error) {
    console.error("Could not check the store's kind", error);
    return false;
  }

  return data?.kind === "vendor";
}

export async function claimBoothAction(formData: FormData): Promise<void> {
  const storeId = text(formData, "storeId");
  const showId = text(formData, "showId");
  const booth = boothSchema.safeParse(text(formData, "booth"));

  if (!storeId || !showId || !booth.success) return;
  if (!(await authorizeVendor(storeId))) return;

  // A show that has ended keeps its roster as history; no new claims.
  const show = await findShowById(showId);
  if (!show || new Date(show.ends_at).getTime() < Date.now()) return;

  await claimBooth(showId, storeId, booth.data);
  revalidatePath("/store");
}

export async function leaveShowAction(formData: FormData): Promise<void> {
  const storeId = text(formData, "storeId");
  const showId = text(formData, "showId");

  if (!storeId || !showId) return;
  if (!(await authorizeVendor(storeId))) return;

  await leaveShow(showId, storeId);
  revalidatePath("/store");
}

export async function addInventoryAction(
  _previous: InventoryState,
  formData: FormData,
): Promise<InventoryState> {
  const storeId = text(formData, "storeId");
  if (!storeId || !(await authorizeVendor(storeId))) {
    return { status: "error", message: GENERIC_ERROR };
  }

  const parsed = inventoryEntrySchema.safeParse({
    cardId: text(formData, "cardId"),
    printingId: text(formData, "printingId"),
    form: text(formData, "form"),
    grader: text(formData, "grader"),
    grade: text(formData, "grade"),
    quantity: text(formData, "quantity"),
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? GENERIC_ERROR,
    };
  }

  const outcome = await upsertInventory(storeId, parsed.data);

  if (!outcome.ok) {
    return {
      status: "error",
      message:
        outcome.reason === "at-cap"
          ? "Your inventory is at its cap. Remove lines you no longer carry."
          : GENERIC_ERROR,
    };
  }

  revalidatePath("/store");
  return { status: "added" };
}

export async function removeInventoryAction(formData: FormData): Promise<void> {
  const storeId = text(formData, "storeId");
  const entryId = text(formData, "entryId");

  if (!storeId || !entryId) return;
  if (!(await authorizeVendor(storeId))) return;

  await removeInventory(entryId, storeId);
  revalidatePath("/store");
}

/* -------------------------------------------------------------------------- */
/* Attendee: the hot path                                                     */
/* -------------------------------------------------------------------------- */

const SHOW_SEARCH_MAX = 60;
const SHOW_SEARCH_WINDOW_MS = 5 * 60 * 1000;

/**
 * The attendee's search: cards matched against this show's booths.
 *
 * Public and sessionless on purpose — somebody standing in a convention hall
 * queue should get "booth A12 has it, PSA 9" with nothing between them and
 * the answer but typing a card name. Rate limited per network like every
 * other search, and the show is re-resolved from the code on every call
 * because a Server Action trusts nothing the page knew.
 */
export async function searchShowCardsAction(
  rawCode: string,
  rawQuery: string,
): Promise<ShowSearchResponse> {
  const parsed = cardQuerySchema.safeParse(rawQuery);
  if (!parsed.success) {
    return {
      status: "invalid",
      message: parsed.error.issues[0]?.message ?? "Please enter a search.",
    };
  }

  const rate = checkRateLimit(
    `show-search:${await clientKey()}`,
    SHOW_SEARCH_MAX,
    SHOW_SEARCH_WINDOW_MS,
  );
  if (!rate.allowed) {
    return {
      status: "error",
      message: "Too many searches from this network. Please wait a moment.",
    };
  }

  const code = normalizeJoinCode(rawCode);
  if (classifyCode(code) !== "show") {
    return { status: "error", message: "That show code is not valid." };
  }

  const show = await findShowByJoinCode(code);
  if (!show) return { status: "error", message: "That show could not be found." };

  try {
    const results = await searchCards(parsed.data, {
      setCode: null,
      cardType: null,
      color: null,
    });

    const grouped = await showAvailability(
      show.id,
      results.map((card) => card.id),
    );

    return {
      status: "ok",
      query: parsed.data,
      results,
      availability: Object.fromEntries(grouped),
    };
  } catch (error) {
    console.error("Show search failed", error);
    return { status: "error", message: GENERIC_ERROR };
  }
}
