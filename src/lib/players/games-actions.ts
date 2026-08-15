"use server";

import { redirect } from "next/navigation";

import { getViewer } from "@/lib/auth/session";
import { playerForUser } from "@/lib/players/accounts";
import { isGameSlug } from "@/lib/players/games-catalog";
import { setPlayerGames } from "@/lib/players/games";

/**
 * Saving the games question, from the website's sign-up step.
 *
 * Re-establishes the player from the session - a Server Action is a
 * public POST endpoint - and treats an empty pick as a real answer:
 * somebody who plays none of the five today is still worth knowing
 * about, and the picker can be revisited from settings later.
 */
export async function saveMyGamesAction(formData: FormData): Promise<void> {
  const viewer = await getViewer();

  const playerId =
    viewer.kind === "player"
      ? viewer.playerId
      : viewer.kind === "anonymous"
        ? null
        : ((await playerForUser(viewer.user.id))?.id ?? null);

  if (!playerId) redirect("/login?next=/welcome/games");

  const games = formData
    .getAll("games")
    .map(String)
    .filter((value) => isGameSlug(value));

  await setPlayerGames(playerId, games);

  redirect("/profile");
}
