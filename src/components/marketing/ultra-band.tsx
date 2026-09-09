import { Tv } from "lucide-react";

import { TvFrame } from "@/components/stores/device-frames";
import { UltraMark } from "@/components/stores/ultra-mark";
import { ButtonLink } from "@/components/ui/button";
import { Section } from "@/components/ui/section";
import { ULTRA_PRICE_LABEL, ULTRA_TRIAL_DAYS } from "@/lib/stores/ultra-schema";

/**
 * FlareCast, on the homepage, as the real product.
 *
 * The founder: "make cardflare Ultra feel like a real product, not
 * just another feature section... if we already have real FlareCast
 * imagery, prioritize that... make the FlareCast screen itself large
 * enough to actually see." So the section breaks the page: a band on
 * the surface colour with an accent line across the top and a glow
 * behind one television the full width of the page, which is the
 * display component itself on a sample night, counting in real time.
 */
export function UltraBand() {
  return (
    <Section
      id="for-stores"
      labelledBy="ultra-band-title"
      padding="py-10 md:py-16"
      className="relative overflow-hidden border-t-2 border-accent/60 bg-surface"
    >
      {/* The glow the television throws on the wall behind it. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-[70%] bg-[radial-gradient(ellipse_at_top,var(--color-accent)_0%,transparent_60%)] opacity-15"
      />
      <div className="relative flex flex-col items-center gap-3 text-center md:gap-4">
        <p className="text-xs font-semibold tracking-[0.18em] text-accent uppercase">
          For game stores
        </p>
        <h2
          id="ultra-band-title"
          className="max-w-3xl text-3xl font-bold tracking-tight text-balance text-text-primary sm:text-5xl"
        >
          Run the room with cardflare <UltraMark />.
        </h2>
        <p className="max-w-xl text-pretty text-text-secondary sm:text-lg">
          FlareCast, live Flares, inventory matching, and tournament automation. On the
          TV you already have.
        </p>
      </div>

      <div className="relative mt-6 md:mt-8">
        <TvFrame
          scene="focus"
          label="FlareCast on the wall during round 3: the clock, what the room is hunting, and the code to scan in."
        />
      </div>

      <div className="relative mt-6 flex flex-col items-center gap-3 sm:flex-row sm:justify-center md:mt-8">
        <ButtonLink
          href="/ultra"
          size="lg"
          className="w-full sm:w-auto"
          data-analytics-event="store_pilot_cta_clicked"
        >
          <Tv className="size-4" aria-hidden="true" />
          Start your {ULTRA_TRIAL_DAYS}-day free trial
        </ButtonLink>
        <p className="text-sm text-text-muted">
          {ULTRA_PRICE_LABEL} a month after. Cancel any time.
        </p>
      </div>
    </Section>
  );
}
