"use server";

import { revalidatePath } from "next/cache";

import { getViewer } from "@/lib/auth/session";
import { text } from "@/lib/form-value";
import { checkRateLimit } from "@/lib/rate-limit";
import { MappingUnverifiedError, OptcgApiProvider } from "./providers/optcgapi/adapter";
import { catalogueSource, providerForGame } from "./providers/registry";
import { cleanSetCode } from "./providers/shared";
import { activeSyncRun, syncCards } from "./sync";
import { fullSyncPermitted, parseSyncMode, type SyncActionState } from "./sync-state";

/**
 * Runs a catalog sync from the admin console.
 *
 * This exists because the sync writes with the service-role key, and that key
 * is deliberately not available anywhere a browser can reach. The command-line
 * script remains the reference implementation; this is the same `syncCards`
 * call behind an admin gate, so the operator does not need a checkout and a
 * copy of the key on their laptop to import cards.
 *
 * The provider is chosen here and is not configurable by the caller. Nothing
 * in the request selects a URL, a host, or an endpoint — the spec's ban on
 * client-supplied provider URLs is enforced by there being no such input.
 */

/**
 * A ceiling on how often the provider can be pulled, even by an admin.
 *
 * Small: a sync is a deliberate, occasional act, and a stuck retry loop
 * against a free courtesy service is exactly what gets access withdrawn.
 */
const SYNC_MAX = 4;
const SYNC_WINDOW_MS = 15 * 60 * 1000;

const GENERIC_ERROR = "Something went wrong. Please try again in a moment.";

export async function syncCatalogAction(
  _previous: SyncActionState,
  formData: FormData,
): Promise<SyncActionState> {
  /*
   * Authorisation first, and here rather than in the page. A Server Action is
   * a public POST endpoint — rendering the form behind `requireAdmin` gates
   * the button, not the action.
   */
  const viewer = await getViewer();

  if (viewer.kind !== "admin") {
    return { status: "error", message: GENERIC_ERROR };
  }

  const mode = parseSyncMode(text(formData, "mode"));

  if (!mode) {
    return { status: "error", message: "Choose a sync mode." };
  }

  if (!fullSyncPermitted(mode, text(formData, "confirm"))) {
    return {
      status: "error",
      message:
        "A full sync pulls the provider's entire catalog. Tick the confirmation to continue.",
    };
  }

  // Keyed to the admin, not the network: this is a privileged action, and two
  // admins in one venue should not throttle each other.
  const rate = checkRateLimit(`card-sync:${viewer.user.id}`, SYNC_MAX, SYNC_WINDOW_MS);

  if (!rate.allowed) {
    return {
      status: "error",
      message: `Too many syncs in a short window. Try again in ${Math.ceil(rate.retryAfterSeconds / 60)} minute(s).`,
    };
  }

  try {
    const running = await activeSyncRun();

    if (running) {
      return {
        status: "error",
        message: `A ${running.mode} sync started at ${running.startedAt.replace("T", " ").slice(0, 16)} UTC is still running. Wait for it to finish.`,
      };
    }
  } catch (error) {
    console.error("Could not check for a running sync", error);
    return { status: "error", message: GENERIC_ERROR };
  }

  const provider = new OptcgApiProvider();

  try {
    const summary = await syncCards(provider, { mode });

    revalidatePath("/admin");

    return {
      status: "success",
      mode,
      runId: summary.runId,
      counts: {
        recordsSeen: summary.recordsSeen,
        uniqueCards: summary.uniqueCards,
        cardsUpserted: summary.cardsUpserted,
        printingsUpserted: summary.printingsUpserted,
        recordsFailed: summary.recordsFailed,
      },
    };
  } catch (error) {
    // The run row is already marked failed by `syncCards`; revalidate so the
    // Configuration panel says so rather than showing the previous success.
    revalidatePath("/admin");

    if (error instanceof MappingUnverifiedError) {
      return { status: "failed", message: error.message };
    }

    console.error("Catalog sync failed", error);

    return {
      status: "failed",
      message:
        "The sync failed part-way. Nothing was deleted, and re-running is safe. " +
        "check the runtime logs and card_sync_failures for the reason.",
    };
  }
}

/**
 * Imports one set of one game from its public catalogue.
 *
 * The same `syncCards` behind the same admin gate as the One Piece
 * sync above, with the provider chosen by GAME from a fixed table and
 * never by anything the request names. The set code is the only free
 * text, and it is shaped before it can reach a request path.
 *
 * Full mode, always: a set is already the unit of "a sample", and the
 * two catalogues that can take the whole game (Flesh and Blood,
 * Riftbound) are a few thousand cards, which fits.
 */
export async function importCatalogueSetAction(
  _previous: SyncActionState,
  formData: FormData,
): Promise<SyncActionState> {
  const viewer = await getViewer();

  if (viewer.kind !== "admin") {
    return { status: "error", message: GENERIC_ERROR };
  }

  const game = text(formData, "game") ?? "";
  const source = catalogueSource(game);
  const provider = providerForGame(game);

  if (!source || !provider) {
    return { status: "error", message: "Choose a game with a catalogue." };
  }

  const typed = (text(formData, "setCode") ?? "").trim();
  const setCode = typed ? cleanSetCode(typed) : null;

  if (typed && !setCode) {
    return {
      status: "error",
      message: "A set code is letters, digits and dashes only.",
    };
  }

  if (!setCode && !source.wholeGame) {
    return {
      status: "error",
      message: `${source.sourceName} imports one set at a time. ${source.setCodeHint}`,
    };
  }

  const rate = checkRateLimit(`card-sync:${viewer.user.id}`, SYNC_MAX, SYNC_WINDOW_MS);

  if (!rate.allowed) {
    return {
      status: "error",
      message: `Too many imports in a short window. Try again in ${Math.ceil(rate.retryAfterSeconds / 60)} minute(s).`,
    };
  }

  try {
    const running = await activeSyncRun();

    if (running) {
      return {
        status: "error",
        message: `A ${running.mode} sync started at ${running.startedAt.replace("T", " ").slice(0, 16)} UTC is still running. Wait for it to finish.`,
      };
    }
  } catch (error) {
    console.error("Could not check for a running sync", error);
    return { status: "error", message: GENERIC_ERROR };
  }

  try {
    const summary = await syncCards(provider, {
      mode: "full",
      setCode: setCode ?? undefined,
    });

    revalidatePath("/admin");

    return {
      status: "success",
      mode: "full",
      runId: summary.runId,
      counts: {
        recordsSeen: summary.recordsSeen,
        uniqueCards: summary.uniqueCards,
        cardsUpserted: summary.cardsUpserted,
        printingsUpserted: summary.printingsUpserted,
        recordsFailed: summary.recordsFailed,
      },
    };
  } catch (error) {
    revalidatePath("/admin");
    console.error("Catalogue import failed", error);

    return {
      status: "failed",
      message:
        "The import failed part-way. Nothing was deleted, and re-running is safe. " +
        "Check the runtime logs and card_sync_failures for the reason.",
    };
  }
}
