import { cn } from "@/lib/cn";

/**
 * The one loading mark the website draws.
 *
 * A rotating ring in the accent, the founder's "rotating green thing",
 * replacing the word "Loading" wherever it sat on its own. A word in a
 * corner reads as a broken page; a ring in the middle reads as a page
 * on its way.
 *
 * Tokens only: the track is the border colour and the moving arc the
 * accent, so it sits right on every surface without a hex value here.
 * Both platforms draw the same thing (the app's is an ActivityIndicator
 * in the accent), and both sizes mean the same: small beside a line of
 * text, medium in a box, large on a screen of its own.
 */
export function Spinner({
  size = "md",
  className,
}: {
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-block shrink-0 animate-spin rounded-full border-2 border-border border-t-accent",
        size === "sm" ? "size-4" : size === "lg" ? "size-10" : "size-6",
        className,
      )}
    />
  );
}

/**
 * A whole screen's loading state: the ring, centred, and at most one
 * quiet line under it.
 *
 * Rendered by every route's `loading.tsx` inside the page's own chrome,
 * so the logo and the tab bar are already where they will be when the
 * page lands and only the middle changes. `role="status"` with the
 * visually hidden word tells a screen reader what the ring is for.
 */
export function LoadingScreen({ label }: { label?: string }) {
  return (
    <div
      role="status"
      className="flex min-h-[40dvh] w-full flex-col items-center justify-center gap-3"
    >
      <Spinner size="lg" />
      <span className="sr-only">Loading</span>
      {label && <p className="text-sm text-text-muted">{label}</p>}
    </div>
  );
}
