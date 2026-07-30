import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

interface SectionProps {
  id?: string;
  className?: string;
  children: ReactNode;
  labelledBy?: string;
}

/** Page section with the shared vertical rhythm and max width. */
export function Section({ id, className, children, labelledBy }: SectionProps) {
  return (
    <section
      id={id}
      aria-labelledby={labelledBy}
      className={cn("px-5 py-20 sm:px-6 md:py-28", className)}
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
