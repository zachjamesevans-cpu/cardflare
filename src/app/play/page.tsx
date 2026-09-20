import { permanentRedirect } from "next/navigation";

/**
 * The guest door is gone; the Room tab is the way in.
 *
 * `/play` asked for a display name and handed out a device cookie with
 * no room behind it. Joining a room asks the same question at the
 * moment it matters, so the page had nothing left to do. Kept as a
 * redirect because the path sat in early bookmarks and screenshots.
 */
export default function PlayRedirect(): never {
  permanentRedirect("/room");
}
