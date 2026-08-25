import { Gem, MapPin, Package, Store, Tent } from "lucide-react";

import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Section, SectionHeading } from "@/components/ui/section";
import { VENDOR_PILOT_ANCHOR } from "@/lib/waitlist/preselect";

const BENEFITS = [
  {
    icon: Package,
    title: "Upload before the show",
    description:
      "List what you're bringing from your dashboard, raw singles and graded slabs alike (PSA, BGS or CGC), so your inventory is searchable the moment the doors open.",
  },
  {
    icon: MapPin,
    title: "The sale finds you",
    description:
      "Attendees search the show the moment they arrive and get your booth number. Instead of asking every vendor in the hall, the buyer who wants your card walks straight to your table.",
  },
  {
    icon: Gem,
    title: "Slabs sell as slabs",
    description:
      "A PSA 10 and a BGS 9.5 are two different reasons to cross a hall. Buyers see the grader and grade on every result, best grade first.",
  },
  {
    icon: Tent,
    title: "One weekend at a time",
    description:
      "Claim your booth for each show and move it if the floor plan changes. Leave a show and your stock disappears from it, while your list stays ready for the next one.",
  },
] as const;

export function ForVendors() {
  return (
    <Section id="for-vendors" labelledBy="for-vendors-title">
      <SectionHeading
        id="for-vendors-title"
        eyebrow="For Card Show Vendors"
        title="Every buyer in the room, pointed at you"
        description="The moment someone scans in, cardflare knows what they're hunting and sends them to the booth that has it. Buyers stop working the hall table by table, and you stop hoping the right one reaches yours."
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
          Bringing a case to a show soon? Max is set up with us, booth by booth. Tell us
          where you sell and we will get you on the floor.
        </p>
        <ButtonLink
          href={VENDOR_PILOT_ANCHOR}
          size="lg"
          data-analytics-event="vendor_pilot_cta_clicked"
        >
          Request an invite
        </ButtonLink>
      </div>
    </Section>
  );
}
