import { cn } from "@/lib/cn";

/**
 * The tier names, each wearing its own finish.
 *
 * The founder: "add a cool holo pattern behind the 'ultra' so they feel
 * sleek." Ultra wears the seven-stop foil the Holographic name style
 * uses on a player's profile; Pro wears the Gold name; Max wears the
 * Shimmer. All three are cosmetics a player can actually buy, clipped
 * to the letters, so a tier looks like the thing it sells. Reduced
 * motion keeps the finish and drops the pan.
 */
export function UltraMark({ className }: { className?: string }) {
  return <span className={cn("holo-text", className)}>Ultra</span>;
}

export function ProMark({ className }: { className?: string }) {
  return <span className={cn("gold-text", className)}>Pro</span>;
}

export function MaxMark({ className }: { className?: string }) {
  return <span className={cn("shimmer-text", className)}>Max</span>;
}
