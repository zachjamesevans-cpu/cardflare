import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

interface CardProps {
  as?: "div" | "li" | "article";
  className?: string;
  children: ReactNode;
}

export function Card({ as: Tag = "div", className, children }: CardProps) {
  return (
    <Tag
      className={cn(
        "rounded-[var(--radius-card)] border border-border bg-surface p-6",
        "shadow-[var(--shadow-card)]",
        className,
      )}
    >
      {children}
    </Tag>
  );
}

interface BadgeProps {
  children: ReactNode;
  tone?: "accent" | "neutral";
  className?: string;
}

export function Badge({ children, tone = "accent", className }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium",
        tone === "accent"
          ? "border-accent/30 bg-accent/10 text-accent"
          : "border-border bg-elevated text-text-secondary",
        className,
      )}
    >
      {children}
    </span>
  );
}
