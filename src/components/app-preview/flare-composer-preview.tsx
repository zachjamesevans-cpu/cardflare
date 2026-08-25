import { Check, Radio } from "lucide-react";

import { cn } from "@/lib/cn";
import { CardGlyph, CardIdentity, PreviewFrame, PreviewLabel } from "./primitives";
import type { PreviewCard } from "./types";

const CARD: PreviewCard = {
  name: "Portgas D. Ace",
  setCode: "OP02-013",
  printing: "Manga rare",
};

const PRINTING_OPTIONS = [
  { label: "Any printing works", selected: true },
  { label: "This printing only", selected: false },
] as const;

/**
 * Flare composer screen: how a player states exactly what they are looking for.
 *
 * Pairs with EventRoomPreview to show both halves of the loop without repeating
 * the same screen twice on one page.
 */
export function FlareComposerPreview({ className }: { className?: string }) {
  return (
    <PreviewFrame
      className={className}
      label="Preview of the cardflare app: sending a Flare for Portgas D. Ace, OP02-013 manga rare, with the option to accept any printing selected and a quantity of one."
    >
      <div className="flex items-center gap-2 border-b border-border px-4 py-3.5">
        <Radio className="size-4 text-accent" />
        <p className="text-sm font-semibold text-text-primary">Send a Flare</p>
      </div>

      <div className="flex flex-col gap-4 p-4">
        <div className="flex flex-col gap-2">
          <PreviewLabel>Card you need</PreviewLabel>
          <div className="flex items-center gap-3 rounded-[var(--radius-control)] border border-border bg-canvas p-3">
            <CardGlyph />
            <CardIdentity card={CARD} />
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <PreviewLabel>Printing</PreviewLabel>
          <div className="flex flex-col gap-2">
            {PRINTING_OPTIONS.map((option) => (
              <div
                key={option.label}
                className={cn(
                  "flex items-center gap-2.5 rounded-[var(--radius-control)] border p-2.5 text-xs",
                  option.selected
                    ? "border-accent/45 bg-accent/[0.07] text-text-primary"
                    : "border-border bg-canvas text-text-muted",
                )}
              >
                <span
                  className={cn(
                    "flex size-4 items-center justify-center rounded-full border",
                    option.selected
                      ? "border-accent bg-accent/20"
                      : "border-border-strong",
                  )}
                >
                  {option.selected && <Check className="size-2.5 text-accent" />}
                </span>
                {option.label}
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between rounded-[var(--radius-control)] border border-border bg-canvas px-3 py-2.5">
          <PreviewLabel>Quantity</PreviewLabel>
          <span className="text-sm font-semibold text-text-primary tabular-nums">
            1
          </span>
        </div>

        <div className="rounded-[var(--radius-control)] bg-accent px-3 py-2.5 text-center text-sm font-semibold text-accent-contrast">
          Send Flare to the room
        </div>
      </div>
    </PreviewFrame>
  );
}
