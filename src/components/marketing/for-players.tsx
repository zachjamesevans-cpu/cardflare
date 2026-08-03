import { Check } from "lucide-react";

import { FlareComposerPreview } from "@/components/app-preview/flare-composer-preview";
import { Section, SectionHeading } from "@/components/ui/section";

const BENEFITS = [
  "Find missing cards before the next round starts.",
  "Stop flipping through every binder in the room.",
  "Discover trades you would otherwise walk right past.",
  "Request an exact printing, or any printing that works.",
  "At card shows, search every vendor's booth from your phone — singles and slabs.",
  "Spend more time playing and less time searching.",
] as const;

export function ForPlayers() {
  return (
    <Section id="for-players" labelledBy="for-players-title" className="bg-surface">
      <div className="grid items-center gap-12 md:grid-cols-2 md:gap-16">
        <div className="flex flex-col gap-8">
          <SectionHeading
            id="for-players-title"
            eyebrow="For Players"
            title="The room is full of the cards you need"
            description="You just cannot see them. CardFlare makes the binders around you searchable for the length of the event."
            align="left"
          />

          <ul className="flex flex-col gap-3.5">
            {BENEFITS.map((benefit) => (
              <li key={benefit} className="flex items-start gap-3">
                <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-accent/15">
                  <Check className="size-3 text-accent" aria-hidden="true" />
                </span>
                <span className="leading-relaxed text-text-secondary">{benefit}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex justify-center md:justify-end">
          <FlareComposerPreview />
        </div>
      </div>
    </Section>
  );
}
