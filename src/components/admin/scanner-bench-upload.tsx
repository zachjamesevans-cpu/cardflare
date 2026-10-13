"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { TextInput } from "@/components/ui/controls";
import { Field, fieldIds } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import {
  runBenchmarkAction,
  type ScannerFormState,
} from "@/lib/cards/scan-admin-actions";

function Run() {
  const { pending } = useFormStatus();
  return (
    <div className="flex items-center gap-3">
      <Button type="submit" disabled={pending}>
        {pending && <Spinner size="sm" />}
        Run all three modes
      </Button>
      {pending && (
        <span className="text-sm text-text-muted" role="status">
          Reading with each mode. This takes up to a minute.
        </span>
      )}
    </div>
  );
}

/** A bench photo in, all three modes run on it. Costs real API credit. */
export function ScannerBenchUpload() {
  const [state, action] = useActionState<ScannerFormState, FormData>(
    runBenchmarkAction,
    {
      status: "idle",
    },
  );
  return (
    <form action={action} className="flex flex-col gap-4">
      <Field
        name="photo"
        label="Binder page photo"
        hint="JPEG, PNG or WebP, up to 6 MB."
      >
        <input
          {...fieldIds("photo")}
          name="photo"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          required
          className="text-sm text-text-secondary"
        />
      </Field>
      <Field
        name="label"
        label="Label"
        optional
        hint="What makes this photo a test: glare, angle, alt arts."
      >
        <TextInput {...fieldIds("label")} name="label" maxLength={120} />
      </Field>
      {state.status !== "idle" && (
        <p
          role="status"
          className={
            state.status === "done" ? "text-sm text-success" : "text-sm text-danger"
          }
        >
          {state.message}
        </p>
      )}
      <Run />
    </form>
  );
}
