import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

/** Shared control chrome so inputs, selects and textareas stay identical. */
export const CONTROL_CLASS =
  "w-full rounded-[var(--radius-control)] border border-border bg-canvas px-3.5 py-3 " +
  "text-base text-text-primary placeholder:text-text-muted " +
  "transition-colors duration-[var(--duration-base)] " +
  "hover:border-border-strong focus:border-accent focus:outline-none " +
  "aria-[invalid=true]:border-danger";

/**
 * The ids a field's label, hint and error message use.
 *
 * Internal. `fieldIds` used to return all three and every form spreads that
 * onto its control, so `errorId` and `hintId` were landing on the `<input>`
 * itself — React rejects unknown camelCase props, warned twice per field, and
 * emitted `errorid`/`hintid` attributes into the markup. Only `id` belongs on
 * the control; the other two belong to the elements it points at.
 */
function messageIds(name: string) {
  return { errorId: `${name}-error`, hintId: `${name}-hint` };
}

/** The props a control needs. Spread onto the input, select or textarea. */
export function fieldIds(name: string) {
  return { id: name };
}

interface FieldProps {
  name: string;
  label: string;
  hint?: string;
  error?: string;
  optional?: boolean;
  className?: string;
  children: ReactNode;
}

/**
 * Label + control + message wrapper.
 *
 * The error is rendered with an icon and text rather than colour alone, and is
 * announced politely so screen reader users hear it after a failed submit.
 */
export function Field({
  name,
  label,
  hint,
  error,
  optional = false,
  className,
  children,
}: FieldProps) {
  const { id } = fieldIds(name);
  const { errorId, hintId } = messageIds(name);

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <label htmlFor={id} className="text-sm font-medium text-text-secondary">
        {label}
        {optional && (
          <span className="ml-1.5 text-xs font-normal text-text-muted">Optional</span>
        )}
      </label>

      {children}

      {hint && !error && (
        <p id={hintId} className="text-xs text-text-muted">
          {hint}
        </p>
      )}

      {error && (
        <p
          id={errorId}
          className="flex items-start gap-1.5 text-sm text-danger"
          role="alert"
        >
          <span aria-hidden="true">&#9888;</span>
          <span>{error}</span>
        </p>
      )}
    </div>
  );
}

/** Builds the aria wiring a control needs to point at its hint/error. */
export function describedBy(name: string, hasError: boolean, hasHint: boolean) {
  const { errorId, hintId } = messageIds(name);
  const ids = [hasError ? errorId : null, hasHint && !hasError ? hintId : null];
  const value = ids.filter(Boolean).join(" ");

  return value.length > 0 ? value : undefined;
}
