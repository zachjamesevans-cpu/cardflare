import { cn } from "@/lib/cn";

/**
 * The tier names, each wearing its own finish.
 *
 * The founder: "add a cool holo pattern behind the 'ultra' so they feel
 * sleek." Ultra wears the seven-stop foil the Holographic name style
 * uses on a player's profile; Max wears the Shimmer; Pro wears the brand's
 * own green (below). All three are cosmetics a player can actually buy, clipped
 * to the letters, so a tier looks like the thing it sells. Reduced
 * motion keeps the finish and drops the pan.
 */
export function UltraMark({ className }: { className?: string }) {
  return <span className={cn("holo-text", className)}>Ultra</span>;
}

/*
 * Pro wears the brand's lime, glowing: the founder asked for "a glowing
 * green pro moniker that matches our main brand color", everywhere Pro is
 * named. Read aloud as "Pro", drawn as PRO.
 */
export function ProMark({ className }: { className?: string }) {
  return (
    <span className={cn("pro-mark", className)} aria-label="Pro">
      Pro
    </span>
  );
}

export function MaxMark({ className }: { className?: string }) {
  return <span className={cn("shimmer-text", className)}>Max</span>;
}
