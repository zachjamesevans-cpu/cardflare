import "server-only";

import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";
import { followPlayer } from "./follows";

/**
 * Every new player follows the founder, so their Feed has somebody in it
 * on day one. The founder: "it would be cool if everyone automatically
 * followed me or something. they can unfollow as normal ... so when
 * someone first signs in, they'll see my flares and my posts."
 *
 * A real person, not an account made up for the purpose - the Feed's
 * rule (feed/repository.ts, AnnouncementItem) is that every face on it
 * belongs to somebody who stood in a shop. An ordinary follow: the
 * unfollow button works on it like any other, and nothing re-adds it.
 */
export const WELCOME_HANDLE = "zach";

/** The founder's player id, or null if the handle is not taken (a fresh
    database, a preview deployment). */
async function welcomeId(): Promise<string | null> {
  const { data, error } = await getSupabaseAdmin()
    .from("players")
    .select("id")
    .eq("handle", WELCOME_HANDLE)
    .maybeSingle();
  if (error) {
    console.error("Could not find the welcome account", error);
    return null;
  }
  return data?.id ?? null;
}

/**
 * Called once, where an account is made (auth/signup.ts and an accepted
 * invite). Never throws: a sign-up must not fail over a follow.
 */
export async function followWelcomeAccount(userId: string): Promise<void> {
  if (!isSupabaseConfigured()) return;
  try {
    const { data: player } = await getSupabaseAdmin()
      .from("players")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();
    const founder = await welcomeId();
    if (!player || !founder || player.id === founder) return;
    /* followPlayer, not the route: no "new follower" notice for each
       sign-up, which would be a notice per stranger. */
    await followPlayer(player.id, founder);
  } catch (caught) {
    console.error("Could not follow the welcome account", caught);
  }
}
