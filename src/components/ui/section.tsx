import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

interface SectionProps {
  id?: string;
  className?: string;
  children: ReactNode;
  labelledBy?: string;
  /**
   * Vertical padding classes, replacing the default rhythm rather than
   * stacking on it: `cn` joins class names and does not merge them, so
   * a `py-10` in `className` would sit beside the default `py-20` and
   * lose to whichever the stylesheet lists last.
   */
  padding?: string;
}

/** Page section with the shared vertical rhythm and max width. */
export function Section({
  id,
  className,
  children,
  labelledBy,
  padding = "py-20 md:py-28",
}: SectionProps) {
  return (
    <section
      id={id}
      aria-labelledby={labelledBy}
      className={cn("px-5 sm:px-6", padding, className)}
    >
      <div className="mx-auto w-full max-w-6xl">{children}</div>
    </section>
  );
}

interface SectionHeadingProps {
  id?: string;
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  align?: "left" | "center";
  className?: string;
}

export function SectionHeading({
  id,
  eyebrow,
  title,
  description,
  align = "center",
  className,
}: SectionHeadingProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-4",
        align === "center" ? "items-center text-center" : "items-start text-left",
        className,
      )}
    >
      {eyebrow && (
        <p className="text-xs font-semibold tracking-[0.18em] text-accent uppercase">
          {eyebrow}
        </p>
      )}

      <h2
        id={id}
        className="max-w-2xl text-3xl font-bold tracking-tight text-balance text-text-primary sm:text-4xl"
      >
        {title}
      </h2>

      {description && (
        <p className="max-w-2xl text-base leading-relaxed text-pretty text-text-secondary sm:text-lg">
          {description}
        </p>
      )}
    </div>
  );
}
