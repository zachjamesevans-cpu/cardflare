"use client";

import { useEffect, useState, type ComponentProps, type ReactNode } from "react";

import { Button } from "@/components/ui/button";

/**
 * A button that asks once before it acts.
 *
 * For the three presses on the console that cannot be taken back in the
 * middle of a night: resetting a round's clock, ending a tournament (its
 * clock goes with it), and issuing a new display link (the TV on the
 * wall goes dark). They sat one tap away, in a two-column grid on a
 * phone, beside the controls a staff member hits mid-round. The first
 * tap turns the label into the question; a second within four seconds
 * does it. Works as a submit button or with an `onConfirm`.
 */
export function ConfirmButton({
  children,
  confirmLabel,
  onConfirm,
  type = "button",
  ...props
}: Omit<ComponentProps<typeof Button>, "onClick"> & {
  children: ReactNode;
  confirmLabel: string;
  onConfirm?: () => void;
}) {
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (!armed) return;
    const settle = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(settle);
  }, [armed]);

  return (
    <Button
      {...props}
      type={type}
      aria-live="polite"
      onClick={(event) => {
        if (!armed) {
          event.preventDefault();
          setArmed(true);
          return;
        }
        setArmed(false);
        onConfirm?.();
      }}
    >
      {armed ? confirmLabel : children}
    </Button>
  );
}
