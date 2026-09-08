import {
  CardTile,
  HeroCtas,
  PlaceChip,
  PLACE_ORDER,
} from "@/components/marketing/places";

export const HERO_SUB =
  "Search nearby collectors, local game stores, and participating card show vendors for the cards you need.";

/**
 * The hero: the line, one sentence, two buttons, and the radar.
 *
 * The founder's brief: "more eye-catching, easier to understand in the
 * first 5 seconds, and less text-heavy." So the paragraph that used to
 * explain the product is gone and a picture does the explaining: one
 * card in the middle of three rings, and the three answers around it.
 * On a phone the rings sit under the buttons and the answers stack.
 */
export function Hero() {
  return (
    <section className="relative overflow-hidden bg-flare-wash px-5 pt-14 pb-16 sm:px-6 md:pt-24 md:pb-24">
      <div className="mx-auto grid w-full max-w-6xl items-center gap-12 md:grid-cols-2 md:gap-10">
        <div className="flex flex-col items-start gap-6">
          <h1 className="text-5xl font-bold tracking-tight text-balance text-text-primary sm:text-6xl lg:text-7xl">
            Find the card.
            <br />
            <span className="text-accent">Make the trade.</span>
          </h1>

          <p className="max-w-lg text-lg leading-relaxed text-pretty text-text-secondary">
            {HERO_SUB}
          </p>

          <HeroCtas analyticsEvent="primary_cta_clicked" />
        </div>

        <div
          className="flex flex-col gap-4"
          role="img"
          aria-label="One card, found three ways: someone nearby has it, your local game store may have it, a vendor booth at the show may have it."
        >
          <div className="relative mx-auto aspect-square w-full max-w-[520px] max-sm:max-w-[300px]">
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
            <div className="hidden sm:contents">
              <PlaceChip
                place="nearby"
                className="absolute top-[4%] right-[0%] w-[52%]"
              />
              <PlaceChip
                place="lgs"
                compact
                className="absolute top-[47%] left-[-4%] w-[36%]"
              />
              <PlaceChip
                place="show"
                className="absolute right-[2%] bottom-[2%] w-[52%]"
              />
            </div>
          </div>

          {/* Phones: the same three answers, stacked under the card. */}
          <div className="flex flex-col gap-2 sm:hidden">
            {PLACE_ORDER.map((place) => (
              <PlaceChip key={place} place={place} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
