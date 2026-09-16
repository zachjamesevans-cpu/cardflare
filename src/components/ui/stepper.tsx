"use client";

import { useState } from "react";
import { Minus, Plus } from "lucide-react";

import { cn } from "@/lib/cn";

/**
 * A count with a minus, a plus and a field in the middle.
 *
 * The buttons are for one at a time; the field is for "I found six of
 * these" without six taps. The field commits when it is left or on
 * Enter, not per keystroke, so typing "12" is one change and not a
 * change to 1 followed by a change to 12. Whatever is typed is clamped
 * to the range on the way out.
 */
export function Stepper({
  value,
  min = 0,
  max,
  onChange,
  label,
  disabled = false,
  className,
}: {
  value: number;
  min?: number;
  max: number;
  onChange: (value: number) => void;
  /** What is being counted, for the buttons' names: "copies of Nami". */
  label: string;
  disabled?: boolean;
  className?: string;
}) {
  const clamp = (next: number) =>
    Math.max(min, Math.min(max, Number.isFinite(next) ? Math.round(next) : min));

  /* The field's own text, reset whenever the value it mirrors moves. */
  const [text, setText] = useState(String(value));
  const [seen, setSeen] = useState(value);
  if (seen !== value) {
    setSeen(value);
    setText(String(value));
  }

  const commit = () => {
    const next = clamp(Number(text));
    setText(String(next));
    if (next !== value) onChange(next);
  };

  const control =
    "flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-[6px] border border-border bg-elevated text-text-primary transition-colors hover:border-border-strong disabled:cursor-default disabled:opacity-40";

  return (
    <div className={cn("flex items-center gap-1", className)}>
      <button
        type="button"
        onClick={() => onChange(clamp(value - 1))}
        disabled={disabled || value <= min}
        aria-label={`Fewer ${label}`}
        className={control}
      >
        <Minus className="size-4" aria-hidden="true" />
      </button>
      <input
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        value={text}
        disabled={disabled}
        aria-label={label}
        onChange={(event) => setText(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            commit();
          }
        }}
        className="h-8 w-11 [appearance:textfield] rounded-[6px] border border-border bg-canvas text-center text-sm font-semibold text-text-primary tabular-nums focus:border-accent focus:outline-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
      <button
        type="button"
        onClick={() => onChange(clamp(value + 1))}
        disabled={disabled || value >= max}
        aria-label={`More ${label}`}
        className={control}
      >
        <Plus className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}
