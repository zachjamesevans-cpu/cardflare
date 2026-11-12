"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, MapPin, MessageCircle, Search, UserCircle2 } from "lucide-react";

import { cn } from "@/lib/cn";
import { LOCAL_ENABLED } from "@/lib/local/enabled";

/**
 * The app's bottom bar, on the website.
 *
 * The founder's parity call: somebody who uses the app on Wednesday and
 * the site on Thursday should not have to learn two products. Same five
 * places, same order: Feed, Nearby, Messages, Search, Profile, so a
 * thumb that knows one knows the other.
 *
 * Nearby is the second place since 2026-10-11, when it took the Rooms
 * slot in the app. The founder: "i really dont think the nights tab
 * will be used as much, and this nearby feature, if it works, could be
 * extremely helpful for people looking for cards." The website had kept
 * Rooms there after the app moved on; it matches again now.
 *
 * Round 16 reshaped it the way Instagram's is. Messages took the
 * Inbox's slot, because conversations are where people come back to;
 * notifications moved to a bell in the Feed's top right
 * (feed/notification-bell.tsx), and posting a Flare is the + at the
 * Feed's top left. A raised + in the middle of the bar was tried and
 * the founder took it out: "Not a fan of the big plus." Five tabs with
 * Messages dead centre was the call after that, and the founder gave
 * the fifth slot to Search, which had been an icon by the bell.
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
     somebody stands in a shop; scanning was a button on the Feed after
     that, and is the QR at Nearby's top left now. See PRODUCT.md. */
  { href: "/feed", label: "Feed", icon: Home },
  /* Local, while it is switched on (src/lib/local/enabled.ts), sits
     ahead of Nearby, as it does in the app's bar. It is off. */
  ...(LOCAL_ENABLED ? [{ href: "/local", label: "Local", icon: MapPin } as const] : []),
  /* Room's slot, which has had three tenants. Nights held it first:
     the founder, "Trying to keep our tabs to our 'hero's'." Then
     (2026-10-09) the store became the room and the tab was Rooms, at
     /nights. Now it is Nearby: Flares near you, with the way into a
     store's room (scan or enter a code) at the page's top left, where
     the Feed has its +. The pin is the app's location glyph. The Rooms
     page keeps its address, /nights, so every link to it still lands;
     it has no slot in the bar, on either platform. */
  { href: "/nearby", label: "Nearby", icon: MapPin },
  /* The conversations list. With Local off, /local is the Messages
     page; with it on, the same page leads with them. In the middle. */
  { href: "/local", label: "Messages", icon: MessageCircle },
  /* Cards, players and stores, one search: /search. */
  { href: "/search", label: "Search", icon: Search },
  { href: "/profile", label: "Profile", icon: UserCircle2 },
] as const;

/** Where each tab stays lit beyond its own address. */
function isActive(label: string, href: string, pathname: string): boolean {
  /*
   * The room lives at /e/CODE once you are in one, and the code door at
   * /room. Nearby owns both: its top left is the door (scan or enter a
   * code), which is how the app gets you into a room too, pushed over
   * the tab you opened it from. Somebody has to own them, or the bar
   * goes blank exactly when a player is deepest in the product.
   *
   * /nights is nobody's. The app keeps Rooms as a screen with no slot
   * in the bar, and no tab is lit while you are on it; the same here.
   */
  if (label === "Nearby" && (pathname.startsWith("/e/") || pathname === "/room"))
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

          const dot = tab.label === "Messages" && unread > 0;

          return (
            <li key={tab.label} className="flex-1">
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                /* Icons only. The founder: "Delete the text below all of
                   the tabs and tighten up the dock. The icons explain
                   themselves." The name stays for a screen reader. */
                className={cn(
                  "flex h-12 items-center justify-center transition-colors active:scale-95",
                  /* White, not grey, when not chosen: the founder, "can
                     you make their outlines white instead of gray? easier
                     to see". The app's dock is the same. */
                  active ? "text-accent" : "text-text-primary hover:text-accent",
                )}
              >
                <span className="relative flex items-center justify-center">
                  <Icon className="size-6.5" aria-hidden="true" />

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

                <span className="sr-only">
                  {tab.label}
                  {dot && ", unread"}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
