import { cn } from "@/lib/cn";

/**
 * How many copies, as one small black and white tag: "×2".
 *
 * The founder, on the binder's pocket tag: "I like how there's the small
 * black quantity amount in the binder too, the Shanks has 2x but it's a
 * lowkey black and white box. Adopt that to all other quantities I
 * select." So every count of copies on a card, anywhere, is this tag;
 * `mobile/src/quantity-badge.tsx` draws the same one in the app.
 *
 * Nothing for one copy: a tag that says "×1" on every card is noise.
 * The one exception is `always`: a picked search result, where "×1"
 * is what says the result is picked at all.
 * Position it from the caller (`absolute top-1 left-1` on a card).
 */
export function QuantityBadge({
  quantity,
  size = "sm",
  always = false,
  className,
}: {
  quantity: number;
  /** "sm" on a thumbnail or pocket, "md" on a large card or a row. */
  size?: "sm" | "md";
  /** Show "×1" too: a picker's mark on a picked result. */
  always?: boolean;
  className?: string;
}) {
  if (!Number.isFinite(quantity) || quantity < 1) return null;
  if (quantity === 1 && !always) return null;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full bg-canvas/85 font-bold text-text-primary tabular-nums ring-1 ring-border-strong",
        size === "sm" ? "px-1.5 py-px text-[9px]" : "px-2 py-0.5 text-xs",
        className,
      )}
    >
      {`×${quantity}`}
    </span>
  );
}
