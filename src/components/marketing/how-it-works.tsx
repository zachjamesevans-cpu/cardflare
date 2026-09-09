import { Handshake, Radio, Search } from "lucide-react";

import { Section } from "@/components/ui/section";

const STEPS = [
  { icon: Radio, title: "Send a Flare", text: "Post the card you need." },
  { icon: Search, title: "cardflare looks", text: "Nearby, your LGS, the show." },
  { icon: Handshake, title: "Make the trade", text: "In person. Earn Embers." },
] as const;

/** Three steps in one row. The heading is the nav's landing spot. */
export function HowItWorks() {
  return (
    <Section
      id="how-it-works"
      labelledBy="how-it-works-title"
      className="border-y border-border bg-surface py-10 md:py-16"
    >
      <h2
        id="how-it-works-title"
        className="mb-6 text-center text-xs font-semibold tracking-[0.18em] text-accent uppercase"
      >
        How it works
      </h2>

      <ol className="grid gap-4 md:grid-cols-3 md:gap-6">
        {STEPS.map((step, index) => (
          <li key={step.title} className="flex items-center gap-4">
            <span className="flex size-12 shrink-0 items-center justify-center rounded-[var(--radius-control)] border border-accent/30 bg-accent/10">
              <step.icon className="size-5 text-accent" aria-hidden="true" />
            </span>
            <div>
              <p className="text-xs font-semibold text-text-muted tabular-nums">
                Step {index + 1}
              </p>
              <h3 className="text-lg font-bold text-text-primary">{step.title}</h3>
              <p className="text-sm text-text-secondary">{step.text}</p>
            </div>
          </li>
        ))}
      </ol>
    </Section>
  );
}
