import { cn } from "@/lib/cn";

/**
 * One look for Follow, whoever is being followed.
 *
 * A player's Follow button and a store's Follow button are the same
 * control with a different row behind it, so they wear the same class:
 * a faint accent tint that asks for the tap, and the quiet elevated
 * pill once it is done. Kept as a plain module so a Server Component
 * can draw a guest's door in the same shape without importing a
 * client component for its class string.
 */
export function followButtonClass(following: boolean, className?: string): string {
  return cn(
    "flex cursor-pointer items-center gap-1.5 rounded-[var(--radius-control)] border px-3 py-1.5 text-sm font-semibold transition-colors",
    following
      ? "border-border bg-elevated text-text-secondary hover:border-border-strong"
      : "border-accent/40 bg-accent/10 text-accent hover:border-accent",
    className,
  );
}
