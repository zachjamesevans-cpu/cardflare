"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { Check, Loader2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { TextInput } from "@/components/ui/controls";
import { describedBy, Field, fieldIds } from "@/components/ui/field";
import {
  checkHandleAction,
  chooseUsernameAction,
  finishSetupAction,
} from "@/lib/players/setup-actions";
import { PASSWORD_MIN } from "@/lib/auth/schema";
import {
  HANDLE_MAX,
  handleFrom,
  handleSeedFrom,
  handleWhileTyping,
} from "@/lib/players/handle";
import { SETUP_IDLE, type SetupState } from "@/lib/players/profile-schema";

/** Below this there is nothing worth asking the server about. */
const MIN_TO_CHECK = 3;

type Availability = "idle" | "checking" | "free" | "taken" | "bad";

/**
 * Picking who you are: a name to be seen as, a handle to be found by.
 *
 * Two fields rather than one, because one field was doing two jobs and
 * doing neither well. The founder's report: "Steven B set up his
 * username as 'Steven B'... if they're gonna do a space it should be an
 * underscore so they can be searched more easily."
 *
 * So the name keeps its space and its capitals, and the handle is
 * derived from it — @steven_b — while it is typed. Deriving stops the
 * moment the handle is edited by hand: somebody who has decided to be
 * @stevo should not have it yanked back to @steven_b by a later
 * correction to their name.
 *
 * Availability is for the handle only. The name stopped needing to be
 * unique the day this shipped, so "somebody already goes by that" is a
 * sentence a person called Zach never has to read again.
 */
export function ChooseUsernameForm({
  suggestion,
  /**
   * Ask for a password here too, and finish the whole account in one
   * submit.
   *
   * The founder's report: "the username should also be something you
   * can type in on the same screen. It should not go to 'choose your
   * username' after." Both halves of signing up are one act, so an
   * invited account gets one form. Somebody who already has a password
   * and is only picking a name gets this same form without the two
   * extra fields.
   */
  withPassword = false,
  /** The address being set up, for password managers and for the copy. */
  signedInAs,
  submitLabel = "Continue",
}: {
  suggestion: string;
  withPassword?: boolean;
  signedInAs?: string;
  submitLabel?: string;
}) {
  const [state, action] = useActionState<SetupState, FormData>(
    withPassword ? finishSetupAction : chooseUsernameAction,
    SETUP_IDLE,
  );

  const [name, setName] = useState(suggestion);
  const [handle, setHandle] = useState(() => handleSeedFrom(suggestion));

  /** Once they have edited it themselves, the name stops driving it. */
  const [handleOwned, setHandleOwned] = useState(false);

  const trimmed = handle.trim();
  const tooShort = trimmed.length < MIN_TO_CHECK;

  /**
   * The last answer, and which handle produced it.
   *
   * Held as one value so "are we still waiting" is derived by comparing
   * it to what is currently typed, rather than tracked as a second flag
   * that has to be kept in step. Nothing is set synchronously in the
   * effect — doing that is a cascading render, and React will say so.
   * The same shape the card search uses.
   */
  const [settled, setSettled] = useState<{
    handle: string;
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
      void checkHandleAction(trimmed).then((verdict) => {
        if (current) setSettled({ handle: trimmed, verdict });
      });
    }, 350);

    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [trimmed, tooShort]);

  const availability: Availability = tooShort
    ? "idle"
    : settled?.handle === trimmed
      ? settled.verdict
      : "checking";

  const error = state.status === "error" ? state.message : undefined;

  return (
    <form action={action} noValidate className="flex flex-col gap-5">
      <Field
        name="displayName"
        label="Your name"
        hint="What people see next to everything you post. Spaces and capitals are fine."
      >
        <TextInput
          {...fieldIds("displayName")}
          name="displayName"
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            /* Derives with `handleFrom`, not `handleSeedFrom`: a name
               too short to derive from should leave the handle field
               honestly short, not fill it with the word "player". */
            if (!handleOwned) setHandle(handleFrom(event.target.value));
          }}
          required
          autoFocus
          autoComplete="off"
          maxLength={40}
          placeholder="Your name"
          aria-describedby={describedBy("displayName", false, true)}
        />
      </Field>

      <Field
        name="handle"
        label="Your handle"
        hint="How people look you up. Letters, numbers and underscores only."
        error={error}
      >
        {/* The at-sign sits INSIDE the field rather than beside it, so
            this input keeps the same left edge as the name above. A
            prefix outside the box pushed it right by its own width, and
            a ragged left edge on a two-field form is exactly the "all
            over the place" the founder has called out before. */}
        <div className="relative">
          <span
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-text-muted"
          >
            @
          </span>
          <TextInput
            {...fieldIds("handle")}
            name="handle"
            className="w-full pl-7"
            value={handle}
            onChange={(event) => {
              setHandleOwned(true);
              /* Typed straight into shape rather than rejected after the
                 fact — but with the TYPING shaper: the derivation one
                 refilled "player" the moment backspacing went below
                 three characters, and ate underscores as they were
                 typed. */
              setHandle(handleWhileTyping(event.target.value));
            }}
            required
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={HANDLE_MAX}
            placeholder="your_handle"
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy("handle", !!error, true)}
          />
        </div>
      </Field>

      {/* Live, and quiet about it: no verdict until there is one. */}
      {!error && <Verdict availability={availability} handle={trimmed} />}

      {withPassword && (
        <>
          {/* Hidden, and there for password managers rather than for
              people: a save prompt files the entry under this. */}
          {signedInAs && (
            <input
              type="text"
              name="username"
              value={signedInAs}
              autoComplete="username"
              readOnly
              hidden
            />
          )}

          {/*
           * "Password", not "New password". Nobody setting up an account
           * has an old one, and calling it new is the sort of small
           * wrongness that makes a person wonder what they missed.
           */}
          <Field
            name="password"
            label="Password"
            hint={`At least ${PASSWORD_MIN} characters. A phrase you can remember beats a short scramble.`}
          >
            <TextInput
              {...fieldIds("password")}
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={PASSWORD_MIN}
              required
              aria-describedby={describedBy("password", false, true)}
            />
          </Field>

          <Field name="confirm" label="Confirm password">
            <TextInput
              {...fieldIds("confirm")}
              name="confirm"
              type="password"
              autoComplete="new-password"
              required
              aria-describedby={describedBy("confirm", false, false)}
            />
          </Field>
        </>
      )}

      <SubmitButton blocked={availability === "taken"} label={submitLabel} />
    </form>
  );
}

function Verdict({
  availability,
  handle,
}: {
  availability: Availability;
  handle: string;
}) {
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
      {free ? `@${handle} is free.` : `@${handle} is taken.`}
    </p>
  );
}

function SubmitButton({ blocked, label }: { blocked: boolean; label: string }) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" size="lg" disabled={pending || blocked} className="w-full">
      {pending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
      {pending ? "Saving…" : label}
    </Button>
  );
}
