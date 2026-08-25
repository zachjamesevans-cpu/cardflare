"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Check, Loader2, X } from "lucide-react";

import { CardSearch } from "@/components/cards/card-search";
import { Button } from "@/components/ui/button";
import { Select, TextInput } from "@/components/ui/controls";
import { Card } from "@/components/ui/card";
import { addInventoryAction } from "@/lib/shows/actions";
import { INVENTORY_IDLE } from "@/lib/shows/schema";
import { GRADERS, GRADE_OPTIONS } from "@/lib/shows/schema";
import { printingLabel, type CardPrinting, type CardResult } from "@/lib/cards/schema";

/**
 * Rapid inventory entry, built for the night before a show.
 *
 * The vendor's loop is: search, pick, say what the physical thing is (raw or
 * a slab with a grade), how many, add — and be back at the search box. Same
 * card picker as everywhere else, including tap-a-version preselection, so a
 * vendor listing the alternate art never finds it twice.
 *
 * Raw and slab are radios rather than a select: they change which fields
 * exist, and a choice that reshapes the form should not hide in a dropdown.
 * **No price field**, deliberately — per PRODUCT.md, cardflare walks the
 * buyer to the booth; the sticker does the rest.
 */

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending}>
      {pending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
      {pending ? "Adding…" : "Add to inventory"}
    </Button>
  );
}

export function VendorInventoryForm({
  storeId,
  imagesEnabled,
}: {
  storeId: string;
  imagesEnabled: boolean;
}) {
  const [state, formAction] = useActionState(addInventoryAction, INVENTORY_IDLE);
  const [picked, setPicked] = useState<{
    card: CardResult;
    printingId: string;
  } | null>(null);
  const [form, setForm] = useState<"raw" | "slab">("raw");

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h3 className="font-semibold text-text-primary">Add stock</h3>
        <p className="text-sm text-text-secondary">
          List what you&rsquo;re bringing, raw singles and graded slabs alike. Attendees
          searching at a show see it with your booth number.
        </p>
      </div>

      {state.status !== "idle" && (
        <p
          role="status"
          className={
            state.status === "error"
              ? "flex items-start gap-2 rounded-[var(--radius-control)] border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger"
              : "flex items-start gap-2 rounded-[var(--radius-control)] border border-accent/30 bg-accent/[0.07] px-4 py-3 text-sm text-text-secondary"
          }
        >
          {state.status === "error" ? (
            <X className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          ) : (
            <Check className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden="true" />
          )}
          <span>{state.status === "error" ? state.message : "Added."}</span>
        </p>
      )}

      {!picked ? (
        <CardSearch
          imagesEnabled={imagesEnabled}
          onSelect={(card: CardResult, printing?: CardPrinting) =>
            setPicked({ card, printingId: printing?.id ?? "" })
          }
        />
      ) : (
        <form
          action={formAction}
          className="flex flex-col gap-4"
          key={`${picked.card.id}-${picked.printingId}`}
        >
          <input type="hidden" name="storeId" value={storeId} />
          <input type="hidden" name="cardId" value={picked.card.id} />

          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 flex-col">
              <p className="truncate font-semibold text-text-primary">
                {picked.card.exactName}
              </p>
              <p className="font-mono text-xs text-text-muted">
                {picked.card.canonicalCardNumber}
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setPicked(null)}
            >
              Change
            </Button>
          </div>

          {picked.card.printings.length > 1 && (
            <label className="flex flex-col gap-2">
              <span className="text-sm font-medium text-text-secondary">Printing</span>
              <Select name="printingId" defaultValue={picked.printingId}>
                <option value="">Any printing</option>
                {picked.card.printings.map((printing) => (
                  <option key={printing.id} value={printing.id}>
                    {printingLabel(printing, picked.card.exactName) ?? "This printing"}
                  </option>
                ))}
              </Select>
            </label>
          )}

          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-medium text-text-secondary">
              What is it?
            </legend>
            <div className="flex gap-3">
              {(
                [
                  ["raw", "Raw single"],
                  ["slab", "Graded slab"],
                ] as const
              ).map(([value, label]) => (
                <label
                  key={value}
                  className="flex flex-1 cursor-pointer items-center gap-2.5 rounded-[var(--radius-control)] border border-border bg-canvas px-3.5 py-3 has-checked:border-accent/60 has-checked:bg-accent/[0.06]"
                >
                  <input
                    type="radio"
                    name="form"
                    value={value}
                    checked={form === value}
                    onChange={() => setForm(value)}
                    className="accent-[var(--color-accent)]"
                  />
                  <span className="text-sm font-medium text-text-primary">{label}</span>
                </label>
              ))}
            </div>
          </fieldset>

          {form === "slab" && (
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="flex flex-col gap-2">
                <span className="text-sm font-medium text-text-secondary">
                  Graded by
                </span>
                <Select name="grader" defaultValue="PSA">
                  {GRADERS.map((grader) => (
                    <option key={grader} value={grader}>
                      {grader}
                    </option>
                  ))}
                </Select>
              </label>

              <label className="flex flex-col gap-2">
                <span className="text-sm font-medium text-text-secondary">Grade</span>
                <Select name="grade" defaultValue="10">
                  {GRADE_OPTIONS.map((grade) => (
                    <option key={grade} value={grade}>
                      {grade}
                    </option>
                  ))}
                  <option value="">Authentic (no grade)</option>
                </Select>
              </label>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-[7rem_1fr]">
            <label className="flex flex-col gap-2">
              <span className="text-sm font-medium text-text-secondary">How many</span>
              <TextInput
                name="quantity"
                type="number"
                inputMode="numeric"
                min={1}
                max={999}
                defaultValue={1}
              />
            </label>

            <div className="flex items-end">
              <SubmitButton />
            </div>
          </div>
        </form>
      )}
    </Card>
  );
}
