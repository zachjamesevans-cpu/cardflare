import Link from "next/link";
import { Bell } from "lucide-react";

import { HEADER_BUTTON, HEADER_ICON } from "@/components/ui/header-button";

/**
 * The bell at the Feed's top right: the way to the notifications.
 *
 * The Inbox used to be a tab. Round 16 gave its slot to Messages and
 * put notifications where Instagram keeps them, in the corner of the
 * home screen. A plain glyph in the header's box, no circle behind it,
 * and a small accent dot at its corner while anything is unread: a dot,
 * never a number, the same as the tab bar's. The app's Feed header
 * draws the same bell with the same dot.
 */
export function NotificationBell({ unread }: { unread: number }) {
  return (
    <Link
      href="/inbox"
      aria-label={unread > 0 ? "Notifications, unread" : "Notifications"}
      className={HEADER_BUTTON}
    >
      <Bell className={HEADER_ICON} aria-hidden="true" />
      {unread > 0 && (
        <span
          aria-hidden="true"
          className="absolute right-2.5 bottom-2.5 size-2.5 rounded-full bg-accent ring-2 ring-canvas"
        />
      )}
    </Link>
  );
}
