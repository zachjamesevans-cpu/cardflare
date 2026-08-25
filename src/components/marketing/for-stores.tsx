import { BarChart3, CalendarCheck, QrCode, Store, TrendingUp } from "lucide-react";

import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Section, SectionHeading } from "@/components/ui/section";
import { STORE_PILOT_ANCHOR } from "@/lib/waitlist/preselect";

const BENEFITS = [
  {
    icon: CalendarCheck,
    title: "Live rooms for weekly events",
    description:
      "Open an Event Room for locals, prereleases or a convention floor, then close it when the event ends.",
  },
  {
    icon: QrCode,
    title: "Players join by QR code",
    description:
      "Print one code for the counter. Players scan it and they are in, with no account setup at the door.",
  },
  {
    icon: TrendingUp,
    title: "A better reason to come back",
    description:
      "Players who complete decks at your shop keep showing up at your shop.",
  },
  {
    icon: BarChart3,
    title: "Anonymous event engagement",
    description:
      "See how much trading your events generate, without exposing individual players' data.",
  },
] as const;

export function ForStores() {
  return (
    <Section id="for-stores" labelledBy="for-stores-title" className="bg-surface">
      <SectionHeading
        id="for-stores-title"
        eyebrow="For Game Stores"
        title="Make your events the ones people travel for"
        description="cardflare runs alongside your event, not instead of it. Players post what they're hunting the moment they scan in, matches happen at your tables, and the trades stay in your store between the people standing in it."
      />

      <div className="mt-14 grid gap-5 sm:grid-cols-2">
        {BENEFITS.map((benefit) => (
          <Card key={benefit.title} className="flex flex-col gap-4">
            <span className="flex size-11 items-center justify-center rounded-[var(--radius-control)] border border-accent/30 bg-accent/10">
              <benefit.icon className="size-5 text-accent" aria-hidden="true" />
            </span>
            <div className="flex flex-col gap-2">
              <h3 className="text-lg font-semibold text-text-primary">
                {benefit.title}
              </h3>
              <p className="leading-relaxed text-text-secondary">
                {benefit.description}
              </p>
            </div>
          </Card>
        ))}
      </div>

      <div className="mt-10 flex flex-col items-center gap-4 rounded-[var(--radius-panel)] border border-border bg-surface px-6 py-8 text-center">
        <Store className="size-6 text-accent" aria-hidden="true" />
        <p className="max-w-lg text-pretty text-text-secondary">
          We are looking for a small number of stores to run the first cardflare pilots
          and help shape how it works.
        </p>
        <ButtonLink
          href={STORE_PILOT_ANCHOR}
          size="lg"
          data-analytics-event="store_pilot_cta_clicked"
        >
          Join the Store Pilot
        </ButtonLink>
      </div>
    </Section>
  );
}
