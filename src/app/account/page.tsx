import { permanentRedirect } from "next/navigation";

/**
 * The account page moved into the profile.
 *
 * Kept as a redirect rather than deleted, because this path is in phone
 * bookmarks, in the area switcher's history, and in whatever a player
 * typed into a browser last week. Everything that lived here is now
 * behind the settings cog at `/profile/settings`; the profile itself is
 * what a player wants nine times out of ten, so that is where this
 * lands.
 */
export default function AccountRedirect(): never {
  permanentRedirect("/profile");
}
