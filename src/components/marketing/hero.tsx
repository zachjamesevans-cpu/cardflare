import { CardTile, HeroCtas, PlaceChip } from "@/components/marketing/places";

export const HERO_SUB =
  "One Want List finds cards nearby, at your LGS, and at card shows.";

/**
 * The hero: the line, one sentence, two buttons, and the radar.
 *
 * The founder's brief: "more eye-catching, easier to understand in the
 * first 5 seconds, and less text-heavy." So the paragraph that used to
 * explain the product is gone and a picture does the explaining: one
 * card in the middle of three rings, and the three answers around it.
 * On a phone the radar is left out: the found panel directly under the
 * hero does that job, so the first screen is the line, the sentence and
 * the two buttons, and the product is one thumb-flick away.
 */
export function Hero() {
  return (
    <section className="relative overflow-hidden bg-flare-wash px-5 pt-12 pb-10 sm:px-6 md:pt-24 md:pb-24">
      <div className="mx-auto grid w-full max-w-6xl items-center gap-10 md:grid-cols-2 md:gap-10">
        <div className="flex flex-col items-start gap-5 md:gap-6">
          <h1 className="text-[2.75rem] leading-[1.05] font-bold tracking-tight text-balance text-text-primary sm:text-6xl lg:text-7xl">
            Find the card.
            <br />
            <span className="text-accent">Make the trade.</span>
          </h1>

          <p className="max-w-md text-lg leading-snug text-pretty text-text-secondary sm:text-xl">
            {HERO_SUB}
          </p>

          <HeroCtas analyticsEvent="primary_cta_clicked" />
        </div>

        <div
          className="relative mx-auto hidden aspect-square w-full max-w-[520px] sm:block"
          role="img"
          aria-label="One card, found three ways: someone nearby has it, your local game store may have it, a vendor booth at the show may have it."
        >
          <div
            aria-hidden="true"
            className="absolute inset-0 rounded-full border border-border"
          />
          <div
            aria-hidden="true"
            className="absolute inset-[16%] rounded-full border border-border-strong"
          />
          <div
            aria-hidden="true"
            className="absolute inset-[32%] rounded-full border border-accent/40 shadow-[0_0_80px_-20px_var(--color-accent)]"
          />
          <div className="absolute inset-0 flex items-center justify-center">
            <CardTile className="rotate-[-6deg]" />
          </div>
          <PlaceChip
            place="nearby"
            compact
            className="absolute top-[6%] right-[0%] w-[46%]"
          />
          <PlaceChip
            place="lgs"
            compact
            className="absolute top-[47%] left-[-4%] w-[36%]"
          />
          <PlaceChip
            place="show"
            compact
            className="absolute right-[2%] bottom-[4%] w-[48%]"
          />
        </div>
      </div>
    </section>
  );
}
