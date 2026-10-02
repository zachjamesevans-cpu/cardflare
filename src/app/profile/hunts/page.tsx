import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * The hunts' old address, from the round when they had a page of
 * their own behind a door in the profile's icon row. The hunts are a
 * tab on the profile now, sliding in place under the strip, so a link
 * from before lands on the profile with that tab open.
 */
export default function OldOwnHuntsPage() {
  redirect("/profile?tab=hunts");
}
