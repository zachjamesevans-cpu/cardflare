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
 * imagery, prioritize that." Both pictures are the display component
 * itself on a sample night, counting in real time: the wall during a
 * round, and the wall between rounds while Auto Mode counts down to
 * the next one. The second screen only appears once there is width
 * for it beside the first, so a phone gets the wall and nothing to
 * scroll past.
 */
export function UltraBand() {
  return (
    <Section
      id="for-stores"
      labelledBy="ultra-band-title"
      padding="py-10 md:py-16"
      className="bg-flare-wash"
    >
      <div className="flex flex-col items-center gap-3 text-center md:gap-4">
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

      <div className="mt-6 grid items-start gap-6 md:mt-8 lg:grid-cols-[1.7fr_1fr]">
        <TvFrame
          scene="focus"
          label="FlareCast on the wall during round 3: the clock, what the room is hunting, and the code to scan in."
        />
        <div className="hidden lg:block">
          <TvFrame
            scene="intermission"
            label="Between rounds: Auto Mode counts down to round 4, and the organizer's computer says so out loud."
          />
        </div>
      </div>

      <div className="mt-6 flex flex-col items-center gap-3 sm:flex-row sm:justify-center md:mt-8">
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
