"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarDays,
  Home,
  MapPin,
  MessageCircle,
  Plus,
  UserCircle2,
} from "lucide-react";

import { cn } from "@/lib/cn";
import { LOCAL_ENABLED } from "@/lib/local/enabled";

/**
 * The app's bottom bar, on the website.
 *
 * The founder's parity call: somebody who uses the app on Wednesday and
 * the site on Thursday should not have to learn two products. Same five
 * places, same order: Feed, Nights, the raised +, Messages, Profile,
 * so a thumb that knows one knows the other.
 *
 * Round 16 reshaped it the way Instagram's is. The + in the middle is
 * a raised accent circle that opens Post a Flare: posting is the one
 * thing the bar exists to make easy, so it is the one thing that stands
 * up out of it. Messages took the Inbox's slot, because conversations
 * are where people come back to; notifications moved to a bell in the
 * Feed's top right (feed/notification-bell.tsx).
 *
 * Fixed to the bottom on every width. On a laptop that is unusual for a
 * website and deliberate here: this is the signed-in player surface, the
 * same one they use standing at a counter, and moving the controls to a
 * top bar on desktop would break the muscle memory the parity exists to
 * build. `pb-[env(safe-area-inset-bottom)]` keeps it clear of the home
 * indicator on a phone.
 */

const TABS = [
  /* Feed, not Join. Join was a tab used four times a month, on the days
     somebody stands in a shop; scanning is a button on the Feed now, which
     is fewer taps than the tab it replaced. See PRODUCT.md. */
  { href: "/feed", label: "Feed", icon: Home },
  /* Room's slot. Local took it for a while; with Local switched off
     (src/lib/local/enabled.ts) the slot is Nights: rooms open the
     moment a store posts a night, so the tab is the calendar of them.
     The founder: "Trying to keep our tabs to our 'hero's'." The code
     door (/room) is a button on the Nights page, not a tab. */
  ...(LOCAL_ENABLED
    ? [{ href: "/local", label: "Local", icon: MapPin } as const]
    : [{ href: "/nights", label: "Nights", icon: CalendarDays } as const]),
  /* The raised +, with no label under it: the circle is the label. */
  { href: "/flare", label: "Post a Flare", icon: Plus, raised: true },
  /* The conversations list. With Local off, /local is the Messages
     page; with it on, the same page leads with them. */
  { href: "/local", label: "Messages", icon: MessageCircle },
  { href: "/profile", label: "Profile", icon: UserCircle2 },
] as const;

/** Where each tab stays lit beyond its own address. */
function isActive(label: string, href: string, pathname: string): boolean {
  /*
   * The room lives at /e/CODE once you are in one, and the code door at
   * /room, so the Nights tab has to own both paths too or the bar goes
   * blank exactly when a player is deepest in the product.
   */
  const roomOwner = LOCAL_ENABLED ? "/feed" : "/nights";
  if (href === roomOwner && (pathname.startsWith("/e/") || pathname === "/room"))
    return true;

  /* The notifications are opened from the Feed's bell, so the Feed
     stays lit while they are read, the way the app's stack does. */
  if (label === "Feed" && pathname === "/inbox") return true;

  /* With Local off, /local is the Messages page, conversation open or
     not; with it on, the Local tab owns the address. */
  if (label === "Messages") return !LOCAL_ENABLED && pathname.startsWith("/local");
  if (label === "Local") return pathname.startsWith("/local");

  return pathname === href;
}

/**
 * `unread` is the count of unread messages: the dot on Messages. The
 * notifications' dot is on the Feed's bell.
 */
export function PlayerTabs({ unread = 0 }: { unread?: number }) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Player"
      /*
       * A BUBBLE, not a floor. The founder, after looking at Instagram:
       * "like the bubbles at the bottom instead of having it anchored."
       * The bar sits in from both sides and floats clear of the bottom
       * edge, so the page runs underneath it and visibly keeps going.
       *
       * `backdrop-blur` is the web's nearest thing to the app's Liquid
       * Glass: the same job - let the page through - by the only means
       * a browser has. The translucent surface underneath it is what
       * keeps the labels readable where the blur is unsupported.
       */
      className="fixed inset-x-3 bottom-3.5 z-50 mx-auto max-w-2xl rounded-full border border-border bg-surface/80 shadow-[var(--shadow-panel)] backdrop-blur-xl"
    >
      <ul className="flex items-stretch">
        {TABS.map((tab) => {
          const active = isActive(tab.label, tab.href, pathname);
          const Icon = tab.icon;

          if ("raised" in tab) {
            return (
              <li key={tab.label} className="flex flex-1 items-center justify-center">
                {/* Raised out of the bar: it overlaps the bar's top edge,
                    and the ring in the surface colour cuts it clean from
                    the glass behind. */}
                <Link
                  href={tab.href}
                  aria-label={tab.label}
                  aria-current={active ? "page" : undefined}
                  className="-mt-6 flex size-14 items-center justify-center rounded-full bg-accent text-accent-contrast shadow-[var(--shadow-glow)] ring-4 ring-surface transition-[transform,background-color] hover:bg-accent-hover active:scale-95"
                >
                  <Icon className="size-7" strokeWidth={2.5} aria-hidden="true" />
                </Link>
              </li>
            );
          }

          const dot = tab.label === "Messages" && unread > 0;

          return (
            <li key={tab.label} className="flex-1">
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex flex-col items-center gap-1 py-2 text-[11px] font-medium transition-colors active:scale-95",
                  active ? "text-accent" : "text-text-muted hover:text-text-secondary",
                )}
              >
                <span className="relative flex h-6 items-center justify-center">
                  <Icon className="size-5" aria-hidden="true" />

                  {/* A dot, not a number: the founder, "a small neon green
                      dot on the inbox icon so you know to check your
                      inbox." It moved to Messages with the Inbox's slot.
                      The app's tab bar draws the same. The ring in the
                      bar's colour keeps it legible over the icon. */}
                  {dot && (
                    <span
                      aria-hidden="true"
                      className="absolute -top-0.5 -right-1 size-2.5 rounded-full bg-accent ring-2 ring-surface"
                    />
                  )}
                </span>

                {tab.label}
                {dot && <span className="sr-only">, unread</span>}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
