"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { Check, Loader2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { TextInput } from "@/components/ui/controls";
import { describedBy, Field, fieldIds } from "@/components/ui/field";
import { checkNameAction, chooseUsernameAction } from "@/lib/players/setup-actions";
import { SETUP_IDLE, type SetupState } from "@/lib/players/profile-schema";

/** Below this there is nothing worth asking the server about. */
const MIN_TO_CHECK = 2;

type Availability = "idle" | "checking" | "free" | "taken" | "bad";

/**
 * Picking a username, once.
 *
 * Availability is shown while it is typed rather than only on submit.
 * Usernames are unique now, and a picker that waits until you press the
 * button to say "taken" is the most annoying form on the internet — the
 * founder will hit it, and so will every player after them.
 *
 * It is a courtesy and nothing more. The unique index decides, and the
 * action reports what it decided: two people can be typing the same name
 * at the same moment, and only the database sees both.
 */
export function ChooseUsernameForm({ suggestion }: { suggestion: string }) {
  const [state, action] = useActionState<SetupState, FormData>(
    chooseUsernameAction,
    SETUP_IDLE,
  );

  const [name, setName] = useState(suggestion);

  const trimmed = name.trim();
  const tooShort = trimmed.length < MIN_TO_CHECK;

  /**
   * The last answer, and which name produced it.
   *
   * Held as one value so "are we still waiting" is derived by comparing
   * it to what is currently typed, rather than tracked as a second flag
   * that has to be kept in step. Nothing is set synchronously in the
   * effect — doing that is a cascading render, and React will say so.
   * The same shape the card search uses.
   */
  const [settled, setSettled] = useState<{
    name: string;
    verdict: Availability;
  } | null>(null);

  useEffect(() => {
    if (tooShort) return;

    /*
     * Debounced, and guarded against an earlier answer landing after a
     * later one: typing "za" then "zach" must not end up showing the
     * verdict for "za".
     */
    let current = true;
    const timer = setTimeout(() => {
      void checkNameAction(trimmed).then((verdict) => {
        if (current) setSettled({ name: trimmed, verdict });
      });
    }, 350);

    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [trimmed, tooShort]);

  const availability: Availability = tooShort
    ? "idle"
    : settled?.name === trimmed
      ? settled.verdict
      : "checking";

  const error = state.status === "error" ? state.message : undefined;

  return (
    <form action={action} noValidate className="flex flex-col gap-5">
      <Field
        name="displayName"
        label="Choose your username"
        hint="This is what other players see in a room. You can change it later in your profile."
        error={error}
      >
        <TextInput
          {...fieldIds("displayName")}
          name="displayName"
          value={name}
          onChange={(event) => setName(event.target.value)}
          required
          autoFocus
          autoComplete="off"
          autoCapitalize="none"
          maxLength={40}
          placeholder="Your name or handle"
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy("displayName", !!error, true)}
        />
      </Field>

      {/* Live, and quiet about it: no verdict until there is one. */}
      {!error && <Verdict availability={availability} />}

      <SubmitButton blocked={availability === "taken"} />
    </form>
  );
}

function Verdict({ availability }: { availability: Availability }) {
  if (availability === "idle" || availability === "bad") return null;

  if (availability === "checking") {
    return (
      <p className="flex items-center gap-1.5 text-sm text-text-muted">
        <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
        Checking…
      </p>
    );
  }

  const free = availability === "free";

  return (
    <p
      role="status"
      className={`flex items-center gap-1.5 text-sm ${
        free ? "text-success" : "text-danger"
      }`}
    >
      {free ? (
        <Check className="size-3.5" aria-hidden="true" />
      ) : (
        <X className="size-3.5" aria-hidden="true" />
      )}
      {free ? "That one is free." : "Somebody already goes by that."}
    </p>
  );
}

function SubmitButton({ blocked }: { blocked: boolean }) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" size="lg" disabled={pending || blocked} className="w-full">
      {pending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
      {pending ? "Saving…" : "Continue"}
    </Button>
  );
}
