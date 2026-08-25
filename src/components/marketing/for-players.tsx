import { ButtonLink } from "@/components/ui/button";
import { Check } from "lucide-react";

import { FlareComposerPreview } from "@/components/app-preview/flare-composer-preview";
import { Section, SectionHeading } from "@/components/ui/section";

const BENEFITS = [
  "Post a Flare and reach everyone near you, not just whoever you bump into.",
  "See every hunt in your area on Local, and message people directly when you have the card.",
  "Find missing cards before the next round starts at event night.",
  "Request an exact printing, or any printing that works.",
  "At card shows, search every vendor's booth from your phone, singles and slabs alike.",
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
            title="The cards you need are closer than you think"
            description="Somebody near you has them: around the corner, at your local game store, at the next card show. Post what you are hunting and cardflare connects you; post what you have and it finds the people nearby looking for it."
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

          <ButtonLink
            href="/signup"
            size="lg"
            className="self-start"
            data-analytics-event="player_signup_cta_clicked"
          >
            Create your free account
          </ButtonLink>
        </div>

        <div className="flex justify-center md:justify-end">
          <FlareComposerPreview />
        </div>
      </div>
    </Section>
  );
}
