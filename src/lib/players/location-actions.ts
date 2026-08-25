"use server";

import { revalidatePath } from "next/cache";

import { getViewer } from "@/lib/auth/session";
import { playerForUser } from "@/lib/players/accounts";
import { savePostalCode } from "@/lib/players/location";
import type { PostalState } from "@/lib/players/location-schema";

/**
 * Saving the ZIP a player typed.
 *
 * The website's answer to "where are you". A browser permission prompt
 * is worse than a five-digit field on every axis that matters here: it
 * is granted far less often, it cannot be re-asked once dismissed, and
 * it buys a precision that a list of shops within twenty-five miles has
 * no use for.
 *
 * Re-establishes the player from the session, because a Server Action is
 * a public POST endpoint and the id in the form would be a suggestion.
 */
export async function savePostalCodeAction(
  _previous: PostalState,
  formData: FormData,
): Promise<PostalState> {
  const viewer = await getViewer();

  const playerId =
    viewer.kind === "player"
      ? viewer.playerId
      : viewer.kind === "anonymous"
        ? null
        : ((await playerForUser(viewer.user.id))?.id ?? null);

  if (!playerId) {
    return { status: "error", message: "Sign in to see stores near you." };
  }

  const result = await savePostalCode(
    playerId,
    String(formData.get("postalCode") ?? ""),
  );

  if (!result.ok) {
    return { status: "error", message: result.error ?? "Could not save that." };
  }

  /* The Feed is where the answer shows up, so it has to be rebuilt -
     otherwise somebody types their ZIP, the form says "saved", and the
     section above it still asks the question. */
  revalidatePath("/feed");
  revalidatePath("/local");
  revalidatePath("/profile/settings");

  return {
    status: "saved",
    message: result.postalCode
      ? `Showing stores near ${result.postalCode}.`
      : "Location cleared.",
  };
}
