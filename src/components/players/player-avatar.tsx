import { cn } from "@/lib/cn";
import { avatarHue, initials } from "@/lib/players/avatar";

/**
 * Tailwind cannot see a class name built at runtime, so the six hues are
 * written out. Keeping them adjacent to `AVATAR_HUE_COUNT` is enforced by
 * tests/unit/design-tokens.test.ts rather than by hoping.
 */
const HUE_CLASS: Record<number, string> = {
  1: "text-avatar-1 bg-avatar-1/12 border-avatar-1/25",
  2: "text-avatar-2 bg-avatar-2/12 border-avatar-2/25",
  3: "text-avatar-3 bg-avatar-3/12 border-avatar-3/25",
  4: "text-avatar-4 bg-avatar-4/12 border-avatar-4/25",
  5: "text-avatar-5 bg-avatar-5/12 border-avatar-5/25",
  6: "text-avatar-6 bg-avatar-6/12 border-avatar-6/25",
};

/**
 * A player's avatar: their initials over a colour derived from their session.
 *
 * Decorative — the display name is always rendered beside it — so it is hidden
 * from assistive technology rather than read out as a stray letter.
 */
export function PlayerAvatar({
  displayName,
  seed,
  size = "md",
  className,
}: {
  displayName: string;
  /** Stable per player, so the colour never changes under them. */
  seed: string;
  size?: "sm" | "md";
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full border font-semibold",
        size === "sm" ? "size-8 text-xs" : "size-10 text-sm",
        HUE_CLASS[avatarHue(seed)],
        className,
      )}
    >
      {initials(displayName)}
    </span>
  );
}
