import { Handshake, Radio, Sparkles } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Section, SectionHeading } from "@/components/ui/section";

const STEPS = [
  {
    icon: Radio,
    title: "Send a Flare",
    description: "Post the card you are looking for.",
  },
  {
    icon: Sparkles,
    title: "Get Matched",
    description: "CardFlare finds someone at the event who has it.",
  },
  {
    icon: Handshake,
    title: "Make the Trade",
    description: "Meet in person and complete the trade.",
  },
] as const;

export function HowItWorks() {
  return (
    <Section id="how-it-works" labelledBy="how-it-works-title">
      <SectionHeading
        id="how-it-works-title"
        eyebrow="How It Works"
        title="Three steps to a trade"
        description="No shipping, no negotiating with strangers online. Just the people already in the room with you, at your local game store or a card show."
      />

      <ol className="mt-14 grid gap-5 md:grid-cols-3">
        {STEPS.map((step, index) => (
          <Card as="li" key={step.title} className="flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <span className="flex size-11 items-center justify-center rounded-[var(--radius-control)] border border-accent/30 bg-accent/10">
                <step.icon className="size-5 text-accent" aria-hidden="true" />
              </span>
              <span className="text-sm font-semibold text-text-muted tabular-nums">
                Step {index + 1}
              </span>
            </div>

            <div className="flex flex-col gap-2">
              <h3 className="text-lg font-semibold text-text-primary">{step.title}</h3>
              <p className="leading-relaxed text-text-secondary">{step.description}</p>
            </div>
          </Card>
        ))}
      </ol>

      <p className="mx-auto mt-10 max-w-xl text-center text-pretty text-text-secondary">
        At card shows it&rsquo;s even faster: scan the show&rsquo;s code, search the
        card, and walk straight to the booth that has it &mdash; raw or graded. And
        every search works both ways: it&rsquo;s a buyer delivered to a vendor&rsquo;s
        table.
      </p>
    </Section>
  );
}
