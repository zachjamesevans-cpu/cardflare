"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, CalendarDays, Flame, Home, MapPin, UserCircle2 } from "lucide-react";

import { cn } from "@/lib/cn";
import { LOCAL_ENABLED } from "@/lib/local/enabled";

/**
 * The app's bottom bar, on the website.
 *
 * The founder's parity call: somebody who uses the app on Wednesday and
 * the site on Thursday should not have to learn two products. Same five
 * destinations, same order, same centre mark (Feed, Nights, Flare,
 * Inbox, Profile), so a thumb that knows one knows the other.
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
  { href: "/flare", label: "Flare", icon: null },
  { href: "/inbox", label: "Inbox", icon: Bell },
  { href: "/profile", label: "Profile", icon: UserCircle2 },
] as const;

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
          /*
           * The room lives at /e/CODE once you are in one, and the code
           * door at /room, so the Nights tab has to own both paths too
           * or the bar goes blank exactly when a player is deepest in
           * the product.
           */
          const roomOwner = LOCAL_ENABLED ? "/feed" : "/nights";
          /*
           * With Local off, /local is the Messages page, and Messages
           * is a door inside the Inbox. So the Inbox tab stays lit
           * while somebody reads a conversation, the way it does in
           * the app, where Messages is a screen pushed over the Inbox.
           */
          const inboxOwnsLocal = !LOCAL_ENABLED && pathname.startsWith("/local");
          const active =
            pathname === tab.href ||
            (tab.href === roomOwner &&
              (pathname.startsWith("/e/") || pathname === "/room")) ||
            (tab.href === "/inbox" && inboxOwnsLocal);

          const Icon = tab.icon;

          return (
            <li key={tab.href} className="flex-1">
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex flex-col items-center gap-1 py-2 text-[11px] font-medium transition-colors active:scale-95",
                  active ? "text-accent" : "text-text-muted hover:text-text-secondary",
                )}
              >
                <span className="relative flex h-6 items-center justify-center">
                  {Icon ? (
                    <Icon className="size-5" aria-hidden="true" />
                  ) : (
                    /* The centre tab: a flame, since the mark is off the
                       site for now. The same glyph the Flares list wears. */
                    <Flame className="size-5" aria-hidden="true" />
                  )}

                  {/* A dot, not a number: the founder, "a small neon green
                      dot on the inbox icon so you know to check your
                      inbox." The app's tab bar draws the same. The ring
                      in the bar's colour keeps it legible over the icon. */}
                  {tab.href === "/inbox" && unread > 0 && (
                    <span
                      aria-hidden="true"
                      className="absolute -top-0.5 -right-1 size-2.5 rounded-full bg-accent ring-2 ring-surface"
                    />
                  )}
                </span>

                {tab.label}
                {tab.href === "/inbox" && unread > 0 && (
                  <span className="sr-only">, unread</span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
