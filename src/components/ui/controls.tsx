import type { ComponentPropsWithRef, InputHTMLAttributes } from "react";

import { cn } from "@/lib/cn";
import { CONTROL_CLASS } from "./field";

export function TextInput({ className, ...props }: ComponentPropsWithRef<"input">) {
  return <input className={cn(CONTROL_CLASS, className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentPropsWithRef<"textarea">) {
  return (
    <textarea
      className={cn(CONTROL_CLASS, "min-h-28 resize-y", className)}
      {...props}
    />
  );
}

/**
 * Native select with a custom chevron. `appearance-none` plus a background
 * image keeps the control consistent across platforms while retaining the
 * native picker, which is far better on mobile than a rebuilt listbox.
 */
export function Select({
  className,
  children,
  ...props
}: ComponentPropsWithRef<"select">) {
  return (
    <div className="relative">
      <select
        className={cn(CONTROL_CLASS, "appearance-none pr-10", className)}
        {...props}
      >
        {children}
      </select>
      <svg
        aria-hidden="true"
        viewBox="0 0 20 20"
        fill="none"
        className="pointer-events-none absolute top-1/2 right-3.5 size-4 -translate-y-1/2 text-text-muted"
      >
        <path
          d="m5 7.5 5 5 5-5"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  label: React.ReactNode;
  error?: string;
  errorId?: string;
}

export function Checkbox({
  label,
  error,
  errorId,
  className,
  id,
  ...props
}: CheckboxProps) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex items-start gap-3">
        <input
          id={id}
          type="checkbox"
          className={cn(
            "mt-0.5 size-5 shrink-0 cursor-pointer rounded-[6px] border border-border-strong",
            "bg-canvas accent-accent",
          )}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          {...props}
        />
        <label
          htmlFor={id}
          className="cursor-pointer text-sm leading-relaxed text-text-secondary"
        >
          {label}
        </label>
      </div>

      {error && (
        <p
          id={errorId}
          role="alert"
          className="flex items-start gap-1.5 text-sm text-danger"
        >
          <span aria-hidden="true">&#9888;</span>
          <span>{error}</span>
        </p>
      )}
    </div>
  );
}
