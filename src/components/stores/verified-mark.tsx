import { cn } from "@/lib/cn";

/**
 * cardflare Verified: a brick-and-mortar shop, in the brand green.
 *
 * The founder: "a small badge of a brick and mortar green logo as a
 * verification badge." Our own glyph rather than a library tick, so
 * it cannot be mistaken for a platform's blue check: a storefront with
 * its awning, drawn small enough to sit beside a name. Admin-set,
 * never for sale, never inferred from the tier.
 */
export function VerifiedMark({
  className,
  variant = "round",
  label = "cardflare Verified",
}: {
  className?: string;
  /** Three drawings while the founder picks; one will remain. */
  variant?: "round" | "outline" | "shield";
  label?: string;
}) {
  const size = cn("inline-block size-[1.1em] shrink-0 align-[-0.15em]", className);

  if (variant === "outline") {
    return (
      <svg viewBox="0 0 24 24" className={size} role="img" aria-label={label}>
        <path
          d="M4 9.5 5.6 5h12.8L20 9.5c0 1.4-1.1 2.5-2.5 2.5S15 10.9 15 9.5c0 1.4-1.1 2.5-2.5 2.5S10 10.9 10 9.5c0 1.4-1.1 2.5-2.5 2.5S4 10.9 4 9.5Z"
          className="fill-accent"
        />
        <path
          d="M5.5 12.5V19h13v-6.5"
          className="fill-none stroke-accent"
          strokeWidth="2"
        />
        <path d="M10 19v-4h4v4" className="fill-accent" />
      </svg>
    );
  }

  if (variant === "shield") {
    return (
      <svg viewBox="0 0 24 24" className={size} role="img" aria-label={label}>
        <path
          d="M12 2 4 5v6c0 5 3.4 8.6 8 10 4.6-1.4 8-5 8-10V5l-8-3Z"
          className="fill-accent"
        />
        <path
          d="M7.5 10.2 8.6 7.5h6.8l1.1 2.7c0 .8-.6 1.4-1.4 1.4s-1.4-.6-1.4-1.4c0 .8-.6 1.4-1.4 1.4s-1.4-.6-1.4-1.4c0 .8-.6 1.4-1.4 1.4s-1.4-.6-1.4-1.4Z"
          className="fill-accent-contrast"
        />
        <path
          d="M8.5 12v4.5h7V12"
          className="fill-none stroke-accent-contrast"
          strokeWidth="1.4"
        />
        <path d="M11 16.5v-2.3h2v2.3" className="fill-accent-contrast" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" className={size} role="img" aria-label={label}>
      <circle cx="12" cy="12" r="11" className="fill-accent" />
      <path
        d="M6.2 10.4 7.4 7.2h9.2l1.2 3.2c0 .9-.7 1.6-1.6 1.6s-1.6-.7-1.6-1.6c0 .9-.7 1.6-1.6 1.6S11.4 11.3 11.4 10.4c0 .9-.7 1.6-1.6 1.6s-1.6-.7-1.6-1.6c0 .9-.7 1.6-1.6 1.6s-1.6-.7-1.6-1.6Z"
        className="fill-accent-contrast"
      />
      <path
        d="M7.3 12.4V17h9.4v-4.6"
        className="fill-none stroke-accent-contrast"
        strokeWidth="1.5"
      />
      <path d="M10.6 17v-2.6h2.8V17" className="fill-accent-contrast" />
    </svg>
  );
}
