import { ArrowRight } from "lucide-react";

import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Section } from "@/components/ui/section";

/**
 * Players, stores, vendors: one headline and a sentence or two each.
 *
 * The founder: "Shorten the Players, Stores, and Vendors sections
 * heavily. Do not use long bullet lists." The ids keep the nav's
 * For Players and For Vendors links landing somewhere.
 */
const AUDIENCES = [
  {
    id: "for-players",
    eyebrow: "Players",
    title: "The card is closer than you think.",
    text: "Post what you need. See who has it, and where.",
    href: "/signup",
    cta: "Create free account",
    analytics: "player_signup_cta_clicked",
  },
  {
    id: "for-stores-card",
    eyebrow: "Stores",
    title: "Every night, on the TV.",
    text: "Timers, Flares and your inventory on the TV. One code on the counter.",
    href: "/ultra",
    cta: "See Ultra",
    analytics: undefined,
  },
  {
    id: "for-vendors",
    eyebrow: "Vendors",
    title: "The buyer walks to your booth.",
    text: "Upload before the show. Every search in the hall points at your table.",
    href: "/max",
    cta: "See Max",
    analytics: "vendor_pilot_cta_clicked",
  },
] as const;

export function AudienceTrio() {
  return (
    <Section labelledBy="audience-title" padding="py-8 md:py-14">
      <h2 id="audience-title" className="sr-only">
        Who cardflare is for
      </h2>
      <div className="grid gap-4 md:grid-cols-3">
        {AUDIENCES.map((a) => (
          <Card
            key={a.id}
            id={a.id}
            className="flex scroll-mt-24 flex-col gap-2 md:gap-3"
          >
            <p className="text-xs font-semibold tracking-[0.18em] text-accent uppercase">
              {a.eyebrow}
            </p>
            <h3 className="text-xl font-bold text-text-primary">{a.title}</h3>
            <p className="flex-1 text-sm leading-relaxed text-text-secondary">
              {a.text}
            </p>
            <ButtonLink
              href={a.href}
              size="sm"
              variant="secondary"
              className="self-start"
              data-analytics-event={a.analytics}
            >
              {a.cta}
              <ArrowRight className="size-4" aria-hidden="true" />
            </ButtonLink>
          </Card>
        ))}
      </div>
    </Section>
  );
}
