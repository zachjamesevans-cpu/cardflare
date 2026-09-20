"use server";

import { revalidatePath } from "next/cache";

import { getViewer } from "@/lib/auth/session";
import { text } from "@/lib/form-value";
import { checkRateLimit } from "@/lib/rate-limit";
import { setCasePicks, singlesCatalog } from "@/lib/stores/case";
import { CASE_SIZE, type CaseFormState, type CasePick } from "@/lib/stores/case-schema";

const GENERIC_ERROR = "Something went wrong. Please try again in a moment.";

/**
 * Who may change what is in the case: the store's OWNER, an ORGANIZER
 * the owner named, and an admin. The case is the shop floor, not the
 * billing page - the regular who runs Tuesday nights is exactly who
 * knows what came in this week. The store id posted with the form is
 * the caller's choice, so it is checked against the viewer's own
 * memberships rather than trusted. Returns the user id, for the
 * rate-limit key.
 */
async function authorizedCurator(storeId: string): Promise<string | null> {
  if (!storeId) return null;
  const viewer = await getViewer();
  const allowed =
    viewer.kind === "admin" ||
    (viewer.kind === "store" && Boolean(viewer.storeRoles[storeId])) ||
    (viewer.kind === "player" && viewer.organizerStoreIds.includes(storeId));
  if (!allowed) {
    console.error("Rejected a case change from an unauthorised viewer.");
    return null;
  }
  return viewer.user.id;
}

/** Sixty searches in ten minutes covers a real picking session. */
const SEARCH_LIMIT = 60;
const SEARCH_WINDOW_MS = 10 * 60 * 1000;

/**
 * The picker's search: the store's own singles, matched by name or number.
 *
 * A Server Action is a public POST endpoint, so the search is behind
 * the same authorisation as the save - a store's stock list is theirs.
 */
export async function searchCaseSinglesAction(
  storeId: string,
  query: string,
): Promise<CasePick[]> {
  const userId = await authorizedCurator(storeId);
  if (!userId) return [];

  const rate = checkRateLimit(`case-search:${userId}`, SEARCH_LIMIT, SEARCH_WINDOW_MS);
  if (!rate.allowed) return [];

  const trimmed = typeof query === "string" ? query.trim() : "";
  if (trimmed.length < 2) return [];

  return singlesCatalog(storeId, trimmed.slice(0, 80));
}

/**
 * Saving the case from the console.
 *
 * The form carries the six slots as `cardIds` fields, in order. Every
 * id is re-checked on the server against the store's singles by
 * `setCasePicks`, so the picker's filter is a convenience and the
 * repository's check is the rule.
 */
export async function saveCaseAction(
  _previous: CaseFormState,
  formData: FormData,
): Promise<CaseFormState> {
  const storeId = text(formData, "storeId");
  if (!(await authorizedCurator(storeId))) {
    return { status: "error", message: GENERIC_ERROR };
  }

  const cardIds = formData
    .getAll("cardIds")
    .filter((value): value is string => typeof value === "string")
    .slice(0, CASE_SIZE * 2);

  const outcome = await setCasePicks(storeId, cardIds);
  if (!outcome.ok) {
    return {
      status: "error",
      message:
        outcome.reason === "not-stocked"
          ? "One of those cards is not in your synced singles. Sync again, then pick it."
          : GENERIC_ERROR,
    };
  }

  revalidatePath("/store/case");
  revalidatePath(`/s/${storeId}`);

  return { status: "done", message: "Saved. This is what players see now." };
}
