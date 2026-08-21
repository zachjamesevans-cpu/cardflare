import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const BASE =
  "inline-flex items-center justify-center gap-2 rounded-[var(--radius-control)] " +
  "font-semibold whitespace-nowrap transition-colors duration-[var(--duration-base)] " +
  "disabled:pointer-events-none disabled:opacity-55";

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-accent text-accent-contrast hover:bg-accent-hover " +
    "shadow-[0_0_28px_-10px_var(--color-accent)]",
  secondary:
    "bg-elevated text-text-primary border border-border hover:border-border-strong hover:bg-border/40",
  ghost: "text-text-secondary hover:text-text-primary hover:bg-elevated",
  /*
   * Outlined rather than filled, and that is a judgement about weight
   * rather than a limitation. A destructive button should read as
   * serious without being the loudest thing on a page — the filled
   * accent belongs to the action somebody came to perform, and deleting
   * a shop is never that. It still cannot be mistaken for anything
   * else: it is the only control in the console wearing the danger
   * colour.
   */
  danger:
    "border border-danger/60 bg-danger/10 text-danger hover:border-danger hover:bg-danger/20",
};

/* Minimum 44px tall at md and above keeps mobile touch targets comfortable. */
const SIZES: Record<Size, string> = {
  sm: "h-9 px-3.5 text-sm",
  md: "h-11 px-5 text-sm",
  lg: "h-13 px-7 text-base",
};

export function buttonStyles(variant: Variant = "primary", size: Size = "md") {
  return cn(BASE, VARIANTS[variant], SIZES[size]);
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  children: ReactNode;
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  children,
  ...props
}: ButtonProps) {
  return (
    <button className={cn(buttonStyles(variant, size), className)} {...props}>
      {children}
    </button>
  );
}

interface ButtonLinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  variant?: Variant;
  size?: Size;
  children: ReactNode;
}

export function ButtonLink({
  variant = "primary",
  size = "md",
  className,
  children,
  ...props
}: ButtonLinkProps) {
  return (
    <a className={cn(buttonStyles(variant, size), className)} {...props}>
      {children}
    </a>
  );
}
