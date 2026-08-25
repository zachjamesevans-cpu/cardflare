import { CheckCircle2 } from "lucide-react";

import { Button } from "@/components/ui/button";

interface WaitlistSuccessProps {
  alreadyRegistered: boolean;
  onReset: () => void;
}

/**
 * Confirmation state shown in place of the form.
 *
 * `role="status"` announces it to screen readers when it replaces the form,
 * without stealing focus mid-interaction.
 */
export function WaitlistSuccess({ alreadyRegistered, onReset }: WaitlistSuccessProps) {
  return (
    <div
      role="status"
      className="flex flex-col items-center gap-5 rounded-[var(--radius-panel)] border border-accent/30 bg-accent/[0.06] px-6 py-12 text-center"
    >
      <span className="flex size-14 items-center justify-center rounded-full bg-accent/15">
        <CheckCircle2 className="size-7 text-accent" aria-hidden="true" />
      </span>

      <div className="flex flex-col gap-3">
        <h3 className="text-2xl font-bold text-text-primary">
          {alreadyRegistered ? "We already have your request." : "Request received."}
        </h3>

        <p className="mx-auto max-w-md text-pretty text-text-secondary">
          {alreadyRegistered
            ? "That email already sent us a request, so there's nothing else to do. We'll be in touch to get you set up."
            : "We'll reach out to get you set up. In the meantime a free player account works today, if you also play."}
        </p>
      </div>

      <Button type="button" variant="secondary" onClick={onReset}>
        Add another signup
      </Button>
    </div>
  );
}
