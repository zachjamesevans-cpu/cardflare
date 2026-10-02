import Link from "next/link";
import { BookOpen } from "lucide-react";

import { BinderCover } from "@/components/binder/binder-cover";
import { buttonStyles } from "@/components/ui/button";
import type { BinderSummary } from "@/lib/binder/binder";
import { binderCountLine, binderMatchLine } from "@/lib/binder/covers";
import { cn } from "@/lib/cn";

/**
 * The binder on a profile, between the hunts and the showcase.
 *
 * The closed cover on the left, the facts on the right: how many
 * cards are in it, how many of them a visitor is hunting, and for the
 * owner whether anyone else can open it. One button opens the binder.
 * A visitor with nothing to see (a private binder, or no account
 * behind the name) gets no panel at all: the page decides that by
 * handing over a null summary and never calling this.
 *
 * The owner always has the panel, even with nothing in it, because an
 * empty binder is where "Add cards" lives.
 */
export function BinderPanel({
  summary,
  ownerName,
  yours,
  href,
}: {
  summary: BinderSummary;
  ownerName: string;
  yours: boolean;
  /** The binder page: /profile/binder, or /p/<id>/binder. */
  href: string;
}) {
  const match = yours ? null : binderMatchLine(summary.onYourHunts);
  const empty = yours && summary.count === 0;

  return (
    <section className="relative flex w-full flex-col gap-4 rounded-[var(--radius-control)] border border-border bg-elevated/40 p-4 text-left">
      <div className="flex items-start gap-3">
        <BookOpen className="mt-0.5 size-5 shrink-0 text-accent" aria-hidden="true" />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <p className="font-semibold text-text-primary">Binder</p>
          <p className="text-sm text-text-secondary">
            {binderCountLine(summary.count)}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <BinderCover
          cover={summary.cover}
          frontImageUrl={summary.frontImageUrl}
          /* The name alone: the panel's small cover has no room for more. */
          label={yours ? "Yours" : ownerName}
          size="sm"
        />
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          {match && <p className="text-sm font-semibold text-accent">{match}</p>}
          {yours && (
            <p className="text-sm text-text-muted">
              {summary.isPublic ? "Public" : "Private, only you"}
            </p>
          )}
          <Link href={href} className={cn(buttonStyles("secondary", "sm"), "w-fit")}>
            {empty ? "Add cards" : "Open binder"}
          </Link>
        </div>
      </div>
    </section>
  );
}
