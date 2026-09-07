import { cn } from "@/lib/cn";

/**
 * The word "Ultra", wearing a holo.
 *
 * The founder: "add a cool holo pattern behind the 'ultra' so they feel
 * sleek." The same seven-stop foil the Holographic name style uses on a
 * player's profile, clipped to the letters and panning slowly, so the
 * store tier looks like the thing it sells. Reduced-motion users get
 * the foil without the pan.
 */
export function UltraMark({ className }: { className?: string }) {
  return <span className={cn("holo-text", className)}>Ultra</span>;
}
