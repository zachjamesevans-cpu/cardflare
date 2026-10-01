"use client";

import { useLinkStatus } from "next/link";
import type { ReactNode } from "react";

import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/cn";

/**
 * The inside of one Feed tab, which knows whether its Link is on its way.
 *
 * A tap on a tab used to do nothing visible until the server answered,
 * and on a phone that read as a tap that missed. `useLinkStatus` says
 * when the navigation is pending, so the tab lights up at once and the
 * ring takes the icon's place until the page lands. A prefetched
 * route skips the pending state altogether, which is the point of
 * leaving prefetching on.
 *
 * Its own file because the tab list itself is read from the Feed's
 * server-only repository, and a hook needs a client module.
 */
export function FeedTabFace({
  on,
  title,
  icon,
}: {
  /** The tab the page is showing. */
  on: boolean;
  title: string;
  icon: ReactNode;
}) {
  const { pending } = useLinkStatus();
  const lit = on || pending;

  return (
    <span
      className={cn(
        "flex w-full items-center justify-center gap-1.5 rounded-[14px] border px-2 py-2.5 text-[13px] font-bold transition-colors",
        lit
          ? "border-accent bg-accent/[0.08] text-accent shadow-[0_0_12px_rgba(198,238,79,0.25)]"
          : "border-border bg-surface text-text-secondary hover:border-border-strong hover:text-text-primary",
      )}
    >
      {pending ? <Spinner size="sm" /> : icon}
      <span className="truncate">{title}</span>
    </span>
  );
}
