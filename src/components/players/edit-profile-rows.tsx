"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { ChevronRight } from "lucide-react";

import { SubmitButton } from "@/components/ui/submit-button";
import { TextInput, Textarea } from "@/components/ui/controls";
import { cn } from "@/lib/cn";
import { HANDLE_MAX, handleWhileTyping } from "@/lib/players/handle";
import {
  changeHandleAction,
  renameProfileAction,
  setAboutAction,
} from "@/lib/players/profile-actions";
import {
  BIO_MAX,
  PRONOUNS_MAX,
  PROFILE_IDLE,
  type ProfileState,
} from "@/lib/players/profile-schema";

/**
 * The list on Edit profile: Name, Username, Pronouns, Bio.
 *
 * Instagram's two-column list, label on the left in the muted colour
 * and the value on the right, a hairline between rows. Tapping a row
 * opens it in place: the field, Save, and what the server said. One
 * row open at a time, and a row that closes forgets its draft, so
 * nothing half-typed leaks into the next row's hidden field.
 *
 * Pronouns and bio share one server action that saves both and reads
 * an empty field as "clear it", so each of those two editors carries
 * the other's last saved value in a hidden input. The values shown in
 * the rows are kept here, updated on every save, rather than waited
 * for from a re-render the action may or may not trigger. The app
 * draws the same rows (mobile/src/screens/edit-profile.tsx).
 */

type RowKey = "name" | "username" | "pronouns" | "bio";

const ROWS: { key: RowKey; label: string }[] = [
  { key: "name", label: "Name" },
  { key: "username", label: "Username" },
  { key: "pronouns", label: "Pronouns" },
  { key: "bio", label: "Bio" },
];

interface Values {
  displayName: string;
  handle: string;
  pronouns: string | null;
  bio: string | null;
}

export function EditProfileRows(initial: Values) {
  const [open, setOpen] = useState<RowKey | null>(null);
  const [values, setValues] = useState<Values>(initial);

  const shown = (key: RowKey): { value: string | null; placeholder?: string } => {
    switch (key) {
      case "name":
        return { value: values.displayName };
      case "username":
        return { value: values.handle };
      case "pronouns":
        return { value: values.pronouns, placeholder: "Add pronouns" };
      case "bio":
        return { value: values.bio, placeholder: "Add a bio" };
    }
  };

  const editor = (key: RowKey) => {
    switch (key) {
      case "name":
        return (
          <NameEditor
            value={values.displayName}
            onSaved={(displayName) => setValues((was) => ({ ...was, displayName }))}
          />
        );
      case "username":
        return (
          <HandleEditor
            value={values.handle}
            onSaved={(handle) => setValues((was) => ({ ...was, handle }))}
          />
        );
      case "pronouns":
      case "bio":
        return (
          <AboutEditor
            field={key}
            pronouns={values.pronouns}
            bio={values.bio}
            onSaved={(about) => setValues((was) => ({ ...was, ...about }))}
          />
        );
    }
  };

  return (
    <ul className="flex flex-col">
      {ROWS.map(({ key, label }) => {
        const isOpen = open === key;
        const { value, placeholder } = shown(key);
        return (
          <li key={key} className="border-b border-border last:border-b-0">
            <button
              type="button"
              onClick={() => setOpen(isOpen ? null : key)}
              aria-expanded={isOpen}
              className="flex w-full cursor-pointer items-center gap-4 px-5 py-3.5 text-left transition-colors hover:bg-elevated/60"
            >
              <span className="w-24 shrink-0 text-sm text-text-secondary">{label}</span>
              <span
                className={cn(
                  "min-w-0 flex-1 truncate text-sm",
                  value ? "text-text-primary" : "text-text-muted",
                )}
              >
                {value ?? placeholder}
              </span>
              <ChevronRight
                className={cn(
                  "size-4 shrink-0 text-text-muted transition-transform",
                  isOpen && "rotate-90",
                )}
                aria-hidden="true"
              />
            </button>
            {isOpen && <div className="px-5 pb-4">{editor(key)}</div>}
          </li>
        );
      })}
    </ul>
  );
}

/** What the server said, under the field. Nothing until it has said something. */
function StateLine({ state }: { state: ProfileState }) {
  if (state.status === "idle") return null;
  return (
    <p
      role="status"
      className={cn(
        "text-sm",
        state.status === "error" ? "text-danger" : "text-success",
      )}
    >
      {state.message}
    </p>
  );
}

/** The field takes focus as its row opens, so the tap was the whole gesture. */
function useFocusOnOpen<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  return ref;
}

function NameEditor({
  value,
  onSaved,
}: {
  value: string;
  onSaved: (displayName: string) => void;
}) {
  const [state, action] = useActionState<ProfileState, FormData>(
    async (previous, formData) => {
      const result = await renameProfileAction(previous, formData);
      if (result.status === "saved") {
        onSaved(String(formData.get("displayName") ?? "").trim());
      }
      return result;
    },
    PROFILE_IDLE,
  );
  const input = useFocusOnOpen<HTMLInputElement>();

  return (
    <form action={action} className="flex flex-col gap-2">
      <label htmlFor="edit-profile-name" className="sr-only">
        Name
      </label>
      <div className="flex flex-wrap gap-2">
        <TextInput
          ref={input}
          id="edit-profile-name"
          name="displayName"
          defaultValue={value}
          maxLength={40}
          required
          autoComplete="nickname"
          className="min-w-0 flex-1 basis-48"
        />
        <SubmitButton label="Save" pendingLabel="Saving…" variant="secondary" />
      </div>
      <StateLine state={state} />
    </form>
  );
}

/**
 * Typed straight into shape rather than validated after the fact: a
 * capital or a space becomes what the server would have made of it
 * anyway, so the field never shows something about to be refused.
 */
function HandleEditor({
  value,
  onSaved,
}: {
  value: string;
  onSaved: (handle: string) => void;
}) {
  const [state, action] = useActionState<ProfileState, FormData>(
    async (previous, formData) => {
      const result = await changeHandleAction(previous, formData);
      if (result.status === "saved") {
        onSaved(handleWhileTyping(String(formData.get("handle") ?? "")));
      }
      return result;
    },
    PROFILE_IDLE,
  );
  const [typed, setTyped] = useState(value);
  const input = useFocusOnOpen<HTMLInputElement>();

  return (
    <form action={action} className="flex flex-col gap-2">
      <label htmlFor="edit-profile-handle" className="sr-only">
        Username
      </label>
      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-0 flex-1 basis-48">
          <span
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-text-muted"
          >
            @
          </span>
          <TextInput
            ref={input}
            id="edit-profile-handle"
            name="handle"
            value={typed}
            onChange={(event) => setTyped(handleWhileTyping(event.target.value))}
            maxLength={HANDLE_MAX}
            required
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            className="w-full pl-7"
          />
        </div>
        <SubmitButton label="Save" pendingLabel="Saving…" variant="secondary" />
      </div>
      <StateLine state={state} />
    </form>
  );
}

/**
 * Pronouns or bio, one field showing and the other carried hidden.
 * `setAboutAction` saves both and clears an empty one, so the field
 * that is not being edited has to travel with its last saved value.
 */
function AboutEditor({
  field,
  pronouns,
  bio,
  onSaved,
}: {
  field: "pronouns" | "bio";
  pronouns: string | null;
  bio: string | null;
  onSaved: (about: { pronouns: string | null; bio: string | null }) => void;
}) {
  const [state, action] = useActionState<ProfileState, FormData>(
    async (previous, formData) => {
      const result = await setAboutAction(previous, formData);
      if (result.status === "saved") {
        const savedPronouns = String(formData.get("pronouns") ?? "").trim();
        const savedBio = String(formData.get("bio") ?? "")
          .replace(/\r\n?/g, "\n")
          .trim();
        onSaved({ pronouns: savedPronouns || null, bio: savedBio || null });
      }
      return result;
    },
    PROFILE_IDLE,
  );
  const [typed, setTyped] = useState((field === "bio" ? bio : pronouns) ?? "");
  const input = useFocusOnOpen<HTMLInputElement & HTMLTextAreaElement>();
  const max = field === "bio" ? BIO_MAX : PRONOUNS_MAX;

  return (
    <form action={action} className="flex flex-col gap-2">
      <label htmlFor={`edit-profile-${field}`} className="sr-only">
        {field === "bio" ? "Bio" : "Pronouns"}
      </label>
      {field === "bio" ? (
        <input type="hidden" name="pronouns" value={pronouns ?? ""} />
      ) : (
        <input type="hidden" name="bio" value={bio ?? ""} />
      )}
      <div className="flex flex-wrap items-start gap-2">
        {field === "bio" ? (
          <Textarea
            ref={input}
            id="edit-profile-bio"
            name="bio"
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            maxLength={max}
            rows={4}
            className="min-h-24 min-w-0 flex-1 basis-48"
          />
        ) : (
          <TextInput
            ref={input}
            id="edit-profile-pronouns"
            name="pronouns"
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            maxLength={max}
            autoComplete="off"
            className="min-w-0 flex-1 basis-48"
          />
        )}
        <SubmitButton label="Save" pendingLabel="Saving…" variant="secondary" />
      </div>
      <div className="flex items-center justify-between gap-3">
        <StateLine state={state} />
        <span className="ml-auto text-xs text-text-muted tabular-nums">
          {typed.length}/{max}
        </span>
      </div>
    </form>
  );
}
