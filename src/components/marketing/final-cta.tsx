import { HeroCtas } from "@/components/marketing/places";
import { Section } from "@/components/ui/section";

/** The line again, and the two doors, for whoever read to the end. */
export function FinalCta() {
  return (
    <Section
      labelledBy="final-cta-title"
      padding="py-12 md:py-16"
      className="bg-flare-wash"
    >
      <div className="flex flex-col items-center gap-5 text-center">
        <h2
          id="final-cta-title"
          className="text-[2.5rem] leading-[1.05] font-bold tracking-tight text-text-primary sm:text-5xl"
        >
          Find the card.
          <br />
          <span className="text-accent">Make the trade.</span>
        </h2>
        <HeroCtas analyticsEvent="final_cta_clicked" />
      </div>
    </Section>
  );
}
