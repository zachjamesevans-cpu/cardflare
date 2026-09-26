"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Send } from "lucide-react";

import { Button } from "@/components/ui/button";
import { resendStoreSetupLinkAction } from "@/lib/stores/actions";
import { RESEND_SETUP_LINK_IDLE } from "@/lib/stores/schema";

function SendButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="secondary" disabled={pending}>
      <Send className="size-4" aria-hidden="true" />
      {pending ? "Sending…" : "Send a fresh setup link"}
    </Button>
  );
}

/**
 * The way back for an invited store whose link has run out or been used.
 * Re-sends the invitation with a new link to the address it went to.
 */
export function ResendSetupLinkForm({ storeId }: { storeId: string }) {
  const [state, formAction] = useActionState(
    resendStoreSetupLinkAction,
    RESEND_SETUP_LINK_IDLE,
  );

  return (
    <div className="flex flex-col gap-3">
      <form action={formAction} className="flex flex-wrap items-center gap-3">
        <input type="hidden" name="storeId" value={storeId} />
        <SendButton />
        <p className="text-sm text-text-muted">
          Re-sends the invitation with a new one-tap link, to the address it went to.
        </p>
      </form>

      {state.status === "error" && (
        <p role="alert" className="text-sm text-danger">
          {state.message}
        </p>
      )}

      {state.status === "success" && (
        <div role="status" className="flex flex-col gap-2 text-sm text-text-secondary">
          <p>
            {state.email === "sent"
              ? `Sent to ${state.to}.`
              : state.email === "failed"
                ? `The email provider rejected the message to ${state.to}. Send them this link instead:`
                : `Email is not configured, so nothing was sent to ${state.to}. Send them this link:`}
          </p>
          {state.setupLink && (
            <code className="block max-w-full overflow-x-auto rounded-[var(--radius-control)] border border-border bg-canvas px-3 py-2 font-mono text-xs break-all text-text-primary">
              {state.setupLink}
            </code>
          )}
        </div>
      )}
    </div>
  );
}
