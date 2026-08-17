"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, Home, UserCircle2, Users } from "lucide-react";

import { Logo } from "@/components/brand/logo";
import { cn } from "@/lib/cn";

/**
 * The app's bottom bar, on the website.
 *
 * The founder's parity call: somebody who uses the app on Wednesday and
 * the site on Thursday should not have to learn two products. Same five
 * destinations, same order, same centre mark — Join, Room, Flare,
 * Inbox, Profile — so a thumb that knows one knows the other.
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
  { href: "/room", label: "Room", icon: Users },
  { href: "/flare", label: "Flare", icon: null },
  { href: "/inbox", label: "Inbox", icon: Bell },
  { href: "/profile", label: "Profile", icon: UserCircle2 },
] as const;

export function PlayerTabs({ unread = 0 }: { unread?: number }) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Player"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="mx-auto flex max-w-2xl items-stretch">
        {TABS.map((tab) => {
          /*
           * The room lives at /e/CODE once you are in one, so the Room
           * tab has to own that path too or the bar goes blank exactly
           * when a player is deepest in the product.
           */
          const active =
            pathname === tab.href ||
            (tab.href === "/room" && pathname.startsWith("/e/"));

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
                    /* The centre tab wears the mark, as the app's does.
                       Sized by height; the artwork sets its own width. */
                    <Logo
                      size={22}
                      markOnly
                      className={active ? undefined : "opacity-50"}
                    />
                  )}

                  {tab.href === "/inbox" && unread > 0 && (
                    <span
                      aria-hidden="true"
                      className="absolute -top-0.5 -right-2 min-w-4 rounded-full bg-accent px-1 text-center text-[10px] leading-4 font-bold text-accent-contrast tabular-nums"
                    >
                      {unread > 9 ? "9+" : unread}
                    </span>
                  )}
                </span>

                {tab.label}
                {tab.href === "/inbox" && unread > 0 && (
                  <span className="sr-only">{unread} unread</span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
