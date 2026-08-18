"use client";

import { useActionState, useState } from "react";
import { KeyRound, Mail, UserPen } from "lucide-react";

import { SubmitButton } from "@/components/ui/submit-button";
import { TextInput } from "@/components/ui/controls";
import {
  adminSendResetAction,
  adminSetEmailAction,
  adminSetIdentityAction,
} from "@/lib/players/admin-account-actions";
import {
  ADMIN_ACCOUNT_IDLE,
  type AdminAccountState,
} from "@/lib/players/profile-schema";
import { HANDLE_MAX, handleSeedFrom } from "@/lib/players/handle";

/**
 * The support desk for one player.
 *
 * NOT folded away, and that is a correction. This shipped behind a link
 * reading "Fix their account", inside a row that was itself collapsed —
 * so changing somebody's username took three clicks and the word
 * "username" appeared nowhere along the way. The founder then asked for
 * a feature that already existed, which is the clearest report possible
 * that it could not be found.
 *
 * The row is already folded. Folding its contents again bought nothing
 * and cost the only thing this panel is for.
 */
export function PlayerAccountControls({
  playerId,
  displayName,
  handle,
  email,
}: {
  playerId: string;
  displayName: string;
  handle: string | null;
  email: string | null;
}) {
  return (
    <div className="flex flex-col gap-5 rounded-[var(--radius-control)] border border-border bg-canvas p-4">
      <IdentityForm playerId={playerId} displayName={displayName} handle={handle} />
      <EmailForm playerId={playerId} email={email} />
      <ResetForm playerId={playerId} displayName={displayName} email={email} />
    </div>
  );
}

function Outcome({ state }: { state: AdminAccountState }) {
  if (state.status === "idle") return null;

  return (
    <p
      role="status"
      className={`text-xs ${state.status === "done" ? "text-success" : "text-danger"}`}
    >
      {state.message}
    </p>
  );
}

function IdentityForm({
  playerId,
  displayName,
  handle,
}: {
  playerId: string;
  displayName: string;
  handle: string | null;
}) {
  const [state, action] = useActionState<AdminAccountState, FormData>(
    adminSetIdentityAction,
    ADMIN_ACCOUNT_IDLE,
  );

  const [name, setName] = useState(displayName);
  const [tag, setTag] = useState(handle ?? handleSeedFrom(displayName));

  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="playerId" value={playerId} />

      <p className="flex items-center gap-1.5 text-xs font-semibold text-text-secondary">
        <UserPen className="size-3.5" aria-hidden="true" />
        Name and username
      </p>

      {/* "Username" out loud, because that is the word somebody looking
          for this uses. The two fields keep the product's own
          distinction underneath — a name to be seen as, a handle to be
          found by — but the heading has to be findable first. */}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs text-text-muted">
          Display name
          <TextInput
            name="displayName"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={40}
          />
        </label>

        <label className="flex flex-col gap-1 text-xs text-text-muted">
          Username (@handle)
          <TextInput
            name="handle"
            value={tag}
            /* Typed straight into shape, the same as the player's own
               field, so the console never submits something the index is
               about to refuse. */
            onChange={(event) => setTag(handleSeedFrom(event.target.value))}
            maxLength={HANDLE_MAX}
            autoCapitalize="none"
            spellCheck={false}
            className="font-mono"
          />
        </label>
      </div>

      <p className="text-xs text-text-muted">
        The name is what a room sees. The username is what people search for, and it has
        to be unique.
      </p>

      <SubmitButton label="Save" pendingLabel="Saving…" variant="secondary" size="sm" />
      <Outcome state={state} />
    </form>
  );
}

function EmailForm({ playerId, email }: { playerId: string; email: string | null }) {
  const [state, action] = useActionState<AdminAccountState, FormData>(
    adminSetEmailAction,
    ADMIN_ACCOUNT_IDLE,
  );

  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="playerId" value={playerId} />

      <p className="flex items-center gap-1.5 text-xs font-semibold text-text-secondary">
        <Mail className="size-3.5" aria-hidden="true" />
        Sign-in address
      </p>

      <TextInput
        name="email"
        type="email"
        defaultValue={email ?? ""}
        placeholder="them@example.com"
        aria-label="Email address"
      />

      {/* Said plainly, because it takes effect at once and the person on
          the other end is about to be locked out of the old address. */}
      <p className="text-xs text-text-muted">
        Takes effect immediately. They sign in with the new address from the moment you
        save.
      </p>

      <SubmitButton
        label="Change address"
        pendingLabel="Changing…"
        variant="secondary"
        size="sm"
      />
      <Outcome state={state} />
    </form>
  );
}

function ResetForm({
  playerId,
  displayName,
  email,
}: {
  playerId: string;
  displayName: string;
  email: string | null;
}) {
  const [state, action] = useActionState<AdminAccountState, FormData>(
    adminSendResetAction,
    ADMIN_ACCOUNT_IDLE,
  );

  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="playerId" value={playerId} />
      <input type="hidden" name="email" value={email ?? ""} />
      <input type="hidden" name="displayName" value={displayName} />

      <p className="flex items-center gap-1.5 text-xs font-semibold text-text-secondary">
        <KeyRound className="size-3.5" aria-hidden="true" />
        Password
      </p>

      {email ? (
        <>
          <p className="text-xs text-text-muted">
            Emails {email} a one-tap link that lets them choose a new password. Nothing
            changes until they use it.
          </p>
          <SubmitButton
            label="Send a password link"
            pendingLabel="Sending…"
            variant="secondary"
            size="sm"
          />
        </>
      ) : (
        <p className="text-xs text-text-muted">
          No address on file, so there is nowhere to send a link. Set one above first.
        </p>
      )}

      <Outcome state={state} />
    </form>
  );
}
