"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Loader2, Megaphone } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea, TextInput } from "@/components/ui/controls";
import { postAnnouncementAction } from "@/lib/announcements/actions";
import {
  ANNOUNCEMENT_IDLE,
  BODY_MAX,
  HEADLINE_MAX,
  LINK_LABEL_MAX,
  MAX_DAYS,
  type AnnouncementFormState,
} from "@/lib/announcements/schema";

/**
 * Writes a notice for the Feed.
 *
 * The only place in the product where somebody types words that every
 * player will read, which is why it asks for an end date before it will
 * take anything else. A number of days rather than a date picker: every
 * notice this product has ever wanted is "for the next week or so", and
 * a count of days cannot be typed in the wrong timezone.
 */
export function AnnouncementForm() {
  const [state, action] = useActionState<AnnouncementFormState, FormData>(
    postAnnouncementAction,
    ANNOUNCEMENT_IDLE,
  );

  const [headline, setHeadline] = useState("");
  const [body, setBody] = useState("");

  return (
    <form key={state.status} action={action} className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="headline" className="text-sm font-medium text-text-secondary">
          Headline
        </label>
        <TextInput
          id="headline"
          name="headline"
          required
          maxLength={HEADLINE_MAX}
          value={headline}
          onChange={(event) => setHeadline(event.target.value)}
          placeholder="OP-17 lands Friday"
        />
        {headline.length > 0 && (
          <p className="text-xs text-text-muted tabular-nums">
            {headline.length}/{HEADLINE_MAX}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="body" className="text-sm font-medium text-text-secondary">
          Body
        </label>
        <Textarea
          id="body"
          name="body"
          required
          rows={4}
          maxLength={BODY_MAX}
          value={body}
          onChange={(event) => setBody(event.target.value)}
          placeholder="Paste your deck list now and every card in it is ready to post the moment a board opens."
        />
        {body.length > 0 && (
          <p className="text-xs text-text-muted tabular-nums">
            {body.length}/{BODY_MAX}
          </p>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="linkLabel"
            className="text-sm font-medium text-text-secondary"
          >
            Button label (optional)
          </label>
          <TextInput
            id="linkLabel"
            name="linkLabel"
            maxLength={LINK_LABEL_MAX}
            placeholder="Paste a deck list"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="linkHref" className="text-sm font-medium text-text-secondary">
            Where it goes
          </label>
          <TextInput
            id="linkHref"
            name="linkHref"
            placeholder="/profile/settings"
            className="font-mono text-sm"
          />
          {/* Said here as well as enforced in two other places, because
              the reason is not obvious from a rejection message. */}
          <p className="text-xs text-text-muted">
            A path on cardflare &mdash; links off our own origin are refused. Leave both
            of these empty for a notice with no button.
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="days" className="text-sm font-medium text-text-secondary">
          Runs for
        </label>
        <TextInput
          id="days"
          name="days"
          type="number"
          min={1}
          max={MAX_DAYS}
          defaultValue={7}
          required
          className="w-32"
        />
        <p className="text-xs text-text-muted">
          Days, then it disappears on its own. Required: a notice nobody remembers to
          take down is how a feed rots.
        </p>
      </div>

      <PostButton />

      {state.status === "error" && (
        <p role="alert" className="text-sm text-danger">
          {state.message}
        </p>
      )}

      {state.status === "posted" && (
        <p role="status" className="text-sm text-success">
          &ldquo;{state.headline}&rdquo; is on the Feed.
        </p>
      )}
    </form>
  );
}

function PostButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending} className="w-fit">
      {pending ? (
        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
      ) : (
        <Megaphone className="size-4" aria-hidden="true" />
      )}
      {pending ? "Posting…" : "Post to the Feed"}
    </Button>
  );
}
