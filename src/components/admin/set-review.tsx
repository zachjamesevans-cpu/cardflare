"use client";

import { useState, useTransition } from "react";
import { Check, ChevronDown, ChevronUp, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox, Select, Textarea, TextInput } from "@/components/ui/controls";
import {
  classifyPrintingAction,
  updateCardFactsAction,
} from "@/lib/admin/import-review-actions";
import {
  CLASSIFICATION_LABELS,
  PRINTING_CLASSIFICATIONS,
  classificationOf,
  type PrintingClassification,
} from "@/lib/cards/classify";
import {
  CARD_CATEGORIES,
  CARD_COLORS,
  cardFactsSchema,
} from "@/lib/cards/import-schema";
import type { ReviewPrinting } from "@/lib/cards/imported-sets";

/**
 * Going through an imported set with human eyes.
 *
 * Two different edits live here, because they are two different facts:
 *
 * - What a printing IS — base art, alt art, manga art — is per PICTURE.
 *   The Bandai page says a parallel exists but never what kind, so the
 *   import lands them as "Alt art" and this is where somebody looking
 *   at the actual picture says "that one is the manga art".
 * - What a card DOES — cost, colours, effect — is per NUMBER, shared by
 *   every printing of it. The official list states these and the import
 *   carries them, so this form is for the gaps and the corrections, in
 *   exactly the vocabulary the provider sync uses; a card finished here
 *   answers the same search filters as a synced one.
 *
 * Each classification saves on choice. The facts form saves on its
 * button — it is nine fields, and saving a half-edited card on every
 * keystroke would write the half-edit.
 */

const ATTRIBUTES = ["Slash", "Strike", "Ranged", "Special", "Wisdom"] as const;

type Saved = "idle" | "saving" | "saved" | "error";

export function SetReview({ printings }: { printings: ReviewPrinting[] }) {
  if (printings.length === 0) {
    return (
      <p className="py-6 text-center text-text-secondary">
        Nothing here — this set has no printings.
      </p>
    );
  }

  return (
    <ul className="flex flex-col">
      {printings.map((printing) => (
        <PrintingRow key={printing.printingId} printing={printing} />
      ))}
    </ul>
  );
}

function PrintingRow({ printing }: { printing: ReviewPrinting }) {
  const [choice, setChoice] = useState<PrintingClassification>(() =>
    classificationOf({
      variant_type: printing.variantType,
      is_alternate_art: printing.isAlternateArt,
      is_parallel: printing.isParallel,
      is_promo: printing.isPromo,
      is_reprint: printing.isReprint,
    }),
  );
  const [saved, setSaved] = useState<Saved>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function classify(next: PrintingClassification) {
    setChoice(next);
    setSaved("saving");
    setMessage(null);

    startTransition(async () => {
      const result = await classifyPrintingAction({
        printingId: printing.printingId,
        classification: next,
      });

      setSaved(result.ok ? "saved" : "error");
      if (!result.ok) setMessage(result.reason);
    });
  }

  return (
    <li className="flex flex-col gap-3 border-t border-border py-4 first:border-t-0 first:pt-0">
      <div className="flex flex-wrap items-center gap-3">
        <span className="block w-12 shrink-0 overflow-hidden rounded-[4px] border border-border bg-elevated">
          <span className="block aspect-[60/84] w-full">
            {printing.imageUrl && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={printing.imageUrl}
                alt=""
                loading="lazy"
                className="size-full object-cover"
              />
            )}
          </span>
        </span>

        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-text-primary">{printing.name}</p>
          <p className="font-mono text-xs text-text-muted">
            {printing.cardNumber}
            {printing.rarity ? ` · ${printing.rarity}` : ""}
            {/* The variant word, shown as the search chip shows it. */}
            {(printing.printingLabel ?? printing.variantType)
              ? ` · ${printing.printingLabel ?? printing.variantType}`
              : ""}
          </p>
        </div>

        <label className="flex items-center gap-2 text-sm text-text-secondary">
          This picture is
          <Select
            value={choice}
            disabled={pending}
            onChange={(event) => classify(event.target.value as PrintingClassification)}
          >
            {PRINTING_CLASSIFICATIONS.map((option) => (
              <option key={option} value={option}>
                {CLASSIFICATION_LABELS[option]}
              </option>
            ))}
          </Select>
        </label>

        <SaveMark state={pending ? "saving" : saved} />

        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          className="inline-flex items-center gap-1 text-sm text-text-secondary hover:text-text-primary"
          aria-expanded={open}
        >
          Card details
          {open ? (
            <ChevronUp className="size-4" aria-hidden="true" />
          ) : (
            <ChevronDown className="size-4" aria-hidden="true" />
          )}
        </button>
      </div>

      {message && <p className="text-sm text-danger">{message}</p>}

      {open && <FactsForm printing={printing} />}
    </li>
  );
}

function SaveMark({ state }: { state: Saved }) {
  if (state === "saving") {
    return (
      <Loader2 className="size-4 animate-spin text-text-muted" aria-label="Saving" />
    );
  }
  if (state === "saved") {
    return <Check className="size-4 text-success" aria-label="Saved" />;
  }
  return <span className="size-4" aria-hidden="true" />;
}

/**
 * The card's gameplay facts, editable as one form.
 *
 * Number inputs submit as null when cleared: an emptied field is an
 * explicit statement that the card has none, which is what the schema
 * expects and how "-" on the printed card reads.
 */
function FactsForm({ printing }: { printing: ReviewPrinting }) {
  const { facts } = printing;

  const [cardType, setCardType] = useState(facts.cardType ?? "");
  const [colors, setColors] = useState<string[]>(facts.colors);
  const [cost, setCost] = useState(facts.cost?.toString() ?? "");
  const [life, setLife] = useState(facts.life?.toString() ?? "");
  const [power, setPower] = useState(facts.power?.toString() ?? "");
  const [counter, setCounter] = useState(facts.counter?.toString() ?? "");
  const [attribute, setAttribute] = useState(facts.attribute ?? "");
  const [traits, setTraits] = useState(facts.traits.join(" / "));
  const [rarity, setRarity] = useState(facts.rarity ?? "");
  const [effect, setEffect] = useState(facts.effectText ?? "");
  const [trigger, setTrigger] = useState(facts.triggerText ?? "");

  const [saved, setSaved] = useState<Saved>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function toggleColor(color: string) {
    setColors((current) =>
      current.includes(color)
        ? current.filter((held) => held !== color)
        : [...current, color],
    );
  }

  function save() {
    const number = (raw: string) => (raw.trim() === "" ? null : Number(raw));

    const payload = {
      cardId: printing.cardId,
      cardType: cardType === "" ? null : cardType,
      colors,
      cost: number(cost),
      life: number(life),
      power: number(power),
      counter: number(counter),
      attribute: attribute.trim() === "" ? null : attribute.trim(),
      traits: traits
        .split("/")
        .map((trait) => trait.trim())
        .filter((trait) => trait.length > 0),
      rarity: rarity.trim() === "" ? null : rarity.trim(),
      effectText: effect.trim() === "" ? null : effect.trim(),
      triggerText: trigger.trim() === "" ? null : trigger.trim(),
    };

    /* The server validates regardless; checking here just makes the
       error arrive before a round trip instead of after one. */
    const checked = cardFactsSchema.safeParse(payload);
    if (!checked.success) {
      const issue = checked.error.issues[0];
      setSaved("error");
      setMessage(issue ? `${issue.path.join(".")}: ${issue.message}` : "Invalid.");
      return;
    }

    setSaved("saving");
    setMessage(null);

    startTransition(async () => {
      const result = await updateCardFactsAction(checked.data);
      setSaved(result.ok ? "saved" : "error");
      if (!result.ok) setMessage(result.reason);
    });
  }

  return (
    <div className="flex flex-col gap-4 rounded-[var(--radius-control)] border border-border bg-elevated p-4">
      <p className="text-xs text-text-muted">
        These belong to {printing.cardNumber} itself, so every printing of it changes
        together.
      </p>

      <div className="flex flex-wrap gap-4">
        <label className="flex flex-col gap-1 text-sm text-text-secondary">
          Category
          <Select value={cardType} onChange={(e) => setCardType(e.target.value)}>
            <option value="">—</option>
            {CARD_CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </Select>
        </label>

        <label className="flex flex-col gap-1 text-sm text-text-secondary">
          Attribute
          <TextInput
            list="cf-attributes"
            value={attribute}
            onChange={(e) => setAttribute(e.target.value)}
            className="w-28"
          />
          <datalist id="cf-attributes">
            {ATTRIBUTES.map((option) => (
              <option key={option} value={option} />
            ))}
          </datalist>
        </label>

        <NumberField label="Cost" value={cost} onChange={setCost} />
        <NumberField label="Life" value={life} onChange={setLife} />
        <NumberField label="Power" value={power} onChange={setPower} />
        <NumberField label="Counter" value={counter} onChange={setCounter} />

        <label className="flex flex-col gap-1 text-sm text-text-secondary">
          Rarity
          <TextInput
            value={rarity}
            onChange={(e) => setRarity(e.target.value)}
            className="w-20"
          />
        </label>
      </div>

      <fieldset className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <legend className="float-left mr-1 text-sm text-text-secondary">Colours</legend>
        {CARD_COLORS.map((color) => (
          <Checkbox
            key={color}
            id={`cf-color-${color}`}
            label={<span className="capitalize">{color}</span>}
            checked={colors.includes(color)}
            onChange={() => toggleColor(color)}
          />
        ))}
      </fieldset>

      <label className="flex flex-col gap-1 text-sm text-text-secondary">
        Types (separated by /)
        <TextInput value={traits} onChange={(e) => setTraits(e.target.value)} />
      </label>

      <label className="flex flex-col gap-1 text-sm text-text-secondary">
        Effect
        <Textarea rows={3} value={effect} onChange={(e) => setEffect(e.target.value)} />
      </label>

      <label className="flex flex-col gap-1 text-sm text-text-secondary">
        Trigger
        <Textarea
          rows={2}
          value={trigger}
          onChange={(e) => setTrigger(e.target.value)}
        />
      </label>

      <div className="flex items-center gap-3">
        <Button type="button" onClick={save} disabled={pending}>
          Save card
        </Button>
        <SaveMark state={pending ? "saving" : saved} />
        {message && <p className="text-sm text-danger">{message}</p>}
      </div>
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm text-text-secondary">
      {label}
      <TextInput
        inputMode="numeric"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-20"
      />
    </label>
  );
}
