"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { Select, TextInput } from "@/components/ui/controls";
import { Field, fieldIds } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import {
  saveScannerSettingsAction,
  type ScannerFormState,
} from "@/lib/cards/scan-admin-actions";

/**
 * The scanner's settings: which AI reads, how sure a card must be, what a
 * page may spend, and what each model costs. The founder (2026-10-13):
 * "Make the AI provider selectable through an administrative interface"
 * and "Calculate estimated USD costs from configurable model pricing".
 */

const MODE_LABELS = {
  hybrid: "Hybrid: Anthropic first, OpenAI only for the unsure cards",
  anthropic: "Anthropic only",
  openai: "OpenAI only",
} as const;

function Save() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending && <Spinner size="sm" />}
      Save settings
    </Button>
  );
}

export function ScannerSettingsForm({
  settings,
  keys,
}: {
  settings: {
    mode: keyof typeof MODE_LABELS;
    autoAccept: number;
    reviewFloor: number;
    pageCapCents: number;
    prices: Record<string, [number, number, number]>;
  };
  keys: { anthropic: boolean; openai: boolean };
}) {
  const [state, action] = useActionState<ScannerFormState, FormData>(
    saveScannerSettingsAction,
    { status: "idle" },
  );
  return (
    <form action={action} className="flex flex-col gap-5">
      <p className="text-sm text-text-secondary">
        Anthropic key: {keys.anthropic ? "set" : "missing"} · OpenAI key:{" "}
        {keys.openai ? "set" : "missing"}
        {!keys.openai && " (hybrid runs as Anthropic only until it is set)"}
      </p>
      <Field name="mode" label="Mode">
        <Select {...fieldIds("mode")} name="mode" defaultValue={settings.mode}>
          {Object.entries(MODE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
      </Field>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field
          name="autoAccept"
          label="Auto-accept at"
          hint="Evidence score from 0 to 1. At or above, a card is green."
        >
          <TextInput
            {...fieldIds("autoAccept")}
            name="autoAccept"
            type="number"
            step="0.01"
            min="0"
            max="1"
            defaultValue={settings.autoAccept}
          />
        </Field>
        <Field
          name="reviewFloor"
          label="Review floor"
          hint="Below this, with no number or name, a card is red."
        >
          <TextInput
            {...fieldIds("reviewFloor")}
            name="reviewFloor"
            type="number"
            step="0.01"
            min="0"
            max="1"
            defaultValue={settings.reviewFloor}
          />
        </Field>
        <Field
          name="pageCapCents"
          label="Cap per page (cents)"
          hint="Past this, a page stops asking a second reader."
        >
          <TextInput
            {...fieldIds("pageCapCents")}
            name="pageCapCents"
            type="number"
            step="0.1"
            min="0"
            max="100"
            defaultValue={settings.pageCapCents}
          />
        </Field>
      </div>
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 text-sm font-semibold text-text-primary">
          Prices, US dollars per million tokens: input, output, cached input
        </legend>
        {Object.entries(settings.prices).map(([model, price]) => (
          <div
            key={model}
            className="grid grid-cols-[1fr_repeat(3,6rem)] items-center gap-2"
          >
            <span className="truncate text-sm text-text-secondary">{model}</span>
            {(["in", "out", "cached"] as const).map((part, index) => (
              <TextInput
                key={part}
                name={`price:${model}:${part}`}
                aria-label={`${model} ${part}`}
                type="number"
                step="0.001"
                min="0"
                defaultValue={price[index]}
              />
            ))}
          </div>
        ))}
      </fieldset>
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
      <Save />
    </form>
  );
}
