import { redirect } from "next/navigation";

/**
 * `/poster` on its own is not a page.
 *
 * The poster lives at `/poster/<code>`, one per counter code or night,
 * and is reached from the store console. Somebody who trims the code
 * off the address (the audit did) used to get a bare 404 with none of
 * the site around it. The events tab is where every poster link is.
 */
export default function PosterIndex() {
  redirect("/store/events");
}
