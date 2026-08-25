import { Section, SectionHeading } from "@/components/ui/section";

const FLOW = [
  { actor: "Store", text: "Creates a live Event Room for tonight's tournament." },
  { actor: "Players", text: "Scan the QR code at the counter and join the room." },
  { actor: "Player", text: "Sends a Flare for the card they still need." },
  { actor: "Player", text: "Another player lists that card on their Have List." },
  { actor: "cardflare", text: "Creates a Flare Match and notifies both players." },
  { actor: "Both", text: "Meet at a table and complete the trade in person." },
] as const;

export function ProductPreview() {
  return (
    <Section labelledBy="product-preview-title">
      <SectionHeading
        id="product-preview-title"
        eyebrow="Product Preview"
        title="What an event looks like on cardflare"
        description="One room, one evening, from setup to a completed trade."
      />

      <ol className="mt-14 grid gap-px overflow-hidden rounded-[var(--radius-panel)] border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
        {FLOW.map((step, index) => (
          <li key={step.text} className="flex gap-4 bg-surface p-6">
            <span
              aria-hidden="true"
              className="flex size-8 shrink-0 items-center justify-center rounded-full border border-accent/30 bg-accent/10 text-sm font-bold text-accent tabular-nums"
            >
              {index + 1}
            </span>

            <div className="flex flex-col gap-1.5">
              <p className="text-xs font-bold tracking-wider text-accent uppercase">
                {step.actor}
              </p>
              <p className="leading-relaxed text-pretty text-text-secondary">
                {step.text}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </Section>
  );
}
