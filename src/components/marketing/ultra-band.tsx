import { Tv } from "lucide-react";

import { TvFrame } from "@/components/stores/device-frames";
import { UltraMark } from "@/components/stores/ultra-mark";
import { ButtonLink } from "@/components/ui/button";
import { Section } from "@/components/ui/section";
import { ULTRA_PRICE_LABEL, ULTRA_TRIAL_DAYS } from "@/lib/stores/ultra-schema";

/**
 * FlareCast, on the homepage, at full width.
 *
 * The founder: "Make FlareCast much more visually prominent. Use the
 * strongest existing real FlareCast imagery." The television is the
 * real display component on a sample night, the same frame the Ultra
 * page uses, counting in real time. The button carries the analytics
 * name the old store section had, so the funnel reads the same.
 */
export function UltraBand() {
  return (
    <Section
      id="for-stores"
      labelledBy="ultra-band-title"
      className="bg-flare-wash py-16 md:py-24"
    >
      <div className="flex flex-col items-center gap-4 text-center">
        <p className="text-xs font-semibold tracking-[0.18em] text-accent uppercase">
          For game stores
        </p>
        <h2
          id="ultra-band-title"
          className="max-w-3xl text-3xl font-bold tracking-tight text-balance text-text-primary sm:text-5xl"
        >
          Run the room with cardflare <UltraMark />.
        </h2>
        <p className="max-w-2xl text-pretty text-text-secondary sm:text-lg">
          Clean tournament timers, live Flares, QR check-in, store announcements,
          inventory matching, and more. On the TV you already have.
        </p>
      </div>

      <div className="mt-10">
        <TvFrame
          scene="focus"
          label="FlareCast on the wall during round 3: the clock, what the room is hunting, and the code to scan in."
        />
      </div>

      <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
        <ButtonLink
          href="/ultra"
          size="lg"
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
