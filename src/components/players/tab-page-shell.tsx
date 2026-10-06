import Link from "next/link";

import { Logo } from "@/components/brand/logo";
import { PlayerTabBar, TabBarSpacer } from "@/components/players/player-tab-bar";
import { cn } from "@/lib/cn";
import { SITE } from "@/lib/site";

/**
 * The chrome of a signed-in tab-bar page: the wordmark centred at the
 * top, a door back to the Feed, and the tab bar underneath.
 *
 * The Feed and a player's page share it so the two never drift: no
 * console header, no area switcher, no email in the corner, and never
 * the page's own name twice. The logo links to the Feed rather than to
 * the marketing home because somebody standing on a tab is already
 * signed in, and the home page is the one place they have no reason
 * to be sent.
 */
export function TabPageShell({
  title,
  leading,
  trailing,
  trailingCount = 1,
  children,
}: {
  /** The page's name for screen readers; nothing draws it. */
  title: string;
  /** A control on the left of the wordmark: on the Feed, the + that posts a Flare. */
  leading?: React.ReactNode;
  /** The controls on the right of the wordmark, when there are any. */
  trailing?: React.ReactNode;
  /** How many round buttons `trailing` holds, so the blank on the left
      matches it and the wordmark stays centred. */
  trailingCount?: 1 | 2;
  children: React.ReactNode;
}) {
  return (
    <>
      <main
        id="main"
        className="flex min-h-dvh flex-col items-center gap-4 px-2 pt-6 pb-16 sm:px-6"
      >
        {/* The wordmark, centred, and the doors out on the right: on
            the Feed, search and the notifications bell. Same place on
            both platforms. The blank on the
            left keeps the mark centred whether or not there is a door. */}
        <div className="flex w-full max-w-2xl flex-wrap items-center gap-3">
          <h1 className="sr-only">{title}</h1>
          {/* As wide as the controls on the right, so the wordmark stays
              centred whether the left holds a control or nothing. */}
          <span
            aria-hidden={leading ? undefined : true}
            className={cn(
              "flex shrink-0 items-center",
              trailingCount === 2 ? "h-9 w-20" : "size-9",
            )}
          >
            {leading}
          </span>
          <span className="flex flex-1 justify-center">
            <Link href="/feed" aria-label={`${SITE.name} Feed`}>
              <Logo size={30} priority />
            </Link>
          </span>
          {trailing ?? <span aria-hidden="true" className="size-9 shrink-0" />}
        </div>

        <div className="flex w-full max-w-2xl flex-col gap-3">{children}</div>
        <TabBarSpacer />
      </main>
      <PlayerTabBar />
    </>
  );
}
