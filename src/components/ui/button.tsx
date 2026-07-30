import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "ghost";
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
