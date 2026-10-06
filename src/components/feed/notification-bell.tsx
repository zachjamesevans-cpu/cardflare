import Link from "next/link";
import { Bell } from "lucide-react";

/**
 * The bell at the Feed's top right: the way to the notifications.
 *
 * The Inbox used to be a tab. Round 16 gave its slot to Messages and
 * put notifications where Instagram keeps them, in the corner of the
 * home screen. Same round button as the search beside it, and a small
 * accent dot at its corner while anything is unread: a dot, never a
 * number, the same as the tab bar's. The app's Feed header draws the
 * same bell with the same dot.
 */
export function NotificationBell({ unread }: { unread: number }) {
  return (
    <Link
      href="/inbox"
      aria-label={unread > 0 ? "Notifications, unread" : "Notifications"}
      className="relative flex size-9 shrink-0 items-center justify-center rounded-full border border-border bg-surface text-text-secondary transition-colors hover:border-border-strong hover:text-text-primary"
    >
      <Bell className="size-4" aria-hidden="true" />
      {unread > 0 && (
        <span
          aria-hidden="true"
          className="absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full bg-accent ring-2 ring-surface"
        />
      )}
    </Link>
  );
}
