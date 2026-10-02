import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * The binder list's old address, from the round when it had a page of
 * its own behind a door in the profile's icon row. The binders are a
 * tab on the profile now, sliding in place under the strip, so a link
 * from before lands on the profile with that tab open. The binder
 * pages under here, /profile/binders/<id>, are where they were.
 */
export default function OldOwnBindersPage() {
  redirect("/profile?tab=binders");
}
