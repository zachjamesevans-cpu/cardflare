import { FoundPanel } from "@/components/marketing/found-panel";
import { HeroCtas } from "@/components/marketing/places";

export const HERO_SUB =
  "One Want List finds cards nearby, at your LGS, and at card shows.";

/**
 * The hero: the line, one sentence, two buttons, and the product.
 *
 * The founder: "someone should understand cardflare before their
 * first scroll." So the picture beside the headline is not a diagram
 * but the result itself: the wanted card, and the three places it
 * turned up. On a phone the same panel sits directly under the
 * buttons and starts inside the first screen.
 */
export function Hero() {
  return (
    <section className="relative overflow-hidden bg-flare-wash px-5 pt-10 pb-10 sm:px-6 md:pt-16 md:pb-16">
      <div className="mx-auto grid w-full max-w-6xl items-center gap-8 md:grid-cols-[minmax(0,1fr)_minmax(0,30rem)] md:gap-12">
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

        <FoundPanel className="w-full" />
      </div>
    </section>
  );
}
