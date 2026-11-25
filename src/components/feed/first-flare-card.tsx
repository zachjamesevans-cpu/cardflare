import Link from "next/link";

import { buttonStyles } from "@/components/ui/button";
import {
  FIRST_FLARE,
  FIRST_FLARE_CARDS,
  FIRST_FLARE_SECONDS,
} from "@/lib/feed/first-flare";

/**
 * The first-Flare starter (src/lib/feed/first-flare.ts): a strip of famous
 * cards, dimmed, drifting behind the words, and one button into the
 * composer. The strip is drawn twice in a row and slid by half its width,
 * so it loops without a seam; it holds still for anyone who asked their
 * device for less motion. The app draws the same (first-flare-card.tsx).
 */
export function FirstFlareCard() {
  const strip = [...FIRST_FLARE_CARDS, ...FIRST_FLARE_CARDS];
  return (
    /* No box: the Feed's posts have none, so neither does this - the
       founder, "since our posts don't have rounded rectangles around
       them, why not just apply the same logic here". The strip runs the
       column's full width and a hairline closes it, like a post. */
    <section className="relative isolate overflow-hidden border-b border-border-strong/70">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
        <div
          className="cf-first-flare-strip flex h-full w-max items-center gap-3 opacity-30 motion-reduce:animate-none"
          style={{ animationDuration: `${FIRST_FLARE_SECONDS}s` }}
        >
          {strip.map((card, index) => (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              key={`${card.name}-${index}`}
              src={card.imageUrl}
              alt=""
              loading="lazy"
              className="h-[88%] w-auto shrink-0 rounded-[6px] object-cover"
            />
          ))}
        </div>
        <div className="absolute inset-0 bg-gradient-to-t from-canvas via-canvas/80 to-canvas/20" />
      </div>

      <div className="flex min-h-56 flex-col justify-end gap-3 px-3 pt-5 pb-5">
        <h2 className="font-display text-2xl font-extrabold tracking-tight text-text-primary">
          {FIRST_FLARE.headline}
        </h2>
        <p className="max-w-md text-sm text-text-secondary">{FIRST_FLARE.body}</p>
        <Link href="/flare" className={`${buttonStyles("primary", "sm")} w-fit`}>
          {FIRST_FLARE.label}
        </Link>
      </div>
    </section>
  );
}
