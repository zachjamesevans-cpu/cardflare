"use client";

import { Loader2 } from "lucide-react";

import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";

/**
 * A submit button that says it is working.
 *
 * The founder's rule, from the remove-button round: a press that takes a
 * moment must show that it landed, or the screen reads as frozen and the
 * button gets pressed again. Several forms grew their own copy of this;
 * this is the one they should all be, so the feedback is identical
 * wherever a press waits on the server.
 *
 * `useFormStatus` only reports on the form this sits inside, which is
 * why it has to be its own component rather than part of `Button`.
 */
export function SubmitButton({
  label,
  pendingLabel = "Saving…",
  variant = "primary",
  size = "md",
  className,
}: {
  label: string;
  /** What the button says while the action runs. */
  pendingLabel?: string;
  variant?: "primary" | "secondary" | "ghost";
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const { pending } = useFormStatus();

  return (
    <Button
      type="submit"
      variant={variant}
      size={size}
      className={className}
      disabled={pending}
      /* The label changes under the pointer, so the accessible name is
         pinned to the action rather than to whatever it currently reads. */
      aria-label={label}
    >
      {pending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
      {pending ? pendingLabel : label}
    </Button>
  );
}
