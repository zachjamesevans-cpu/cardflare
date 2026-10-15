"use client";

import { useState } from "react";
import { Check, ChevronRight, PlusCircle, type LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { TextInput } from "@/components/ui/controls";
import { Sheet } from "@/components/ui/sheet";
import { cn } from "@/lib/cn";

/**
 * The composer's two choices as a row that says what is chosen and a
 * sheet that lists the options down: the printing, and the hunt. The
 * founder: "it feels weird to scroll left when everywhere else on the
 * app you scroll down to change printing ... the 'add to a hunt' thing
 * at bottom is very weirdly placed." The app's composer draws the same
 * rows and sheets (mobile/src/composer-sheets.tsx).
 */

/** "Printing   EB-02 · L ›": a choice and where it stands. */
export function PickerRow({
  label,
  value,
  onClick,
  icon: Icon,
}: {
  label: string;
  value: string;
  onClick: () => void;
  icon?: LucideIcon;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${label}, ${value}. Change it`}
      className="flex w-full cursor-pointer items-center gap-2.5 rounded-[var(--radius-control)] border border-border bg-elevated px-3 py-2.5 text-left hover:border-border-strong"
    >
      {Icon && <Icon className="size-4 shrink-0 text-accent" aria-hidden="true" />}
      <span className="text-sm text-text-secondary">{label}</span>
      <span className="min-w-0 flex-1 truncate text-right text-sm font-semibold text-text-primary">
        {value}
      </span>
      <ChevronRight className="size-4 shrink-0 text-text-muted" aria-hidden="true" />
    </button>
  );
}

/** One option in a sheet: the art when there is some, the words, the tick. */
function OptionRow({
  label,
  detail,
  art,
  on,
  onClick,
}: {
  label: string;
  detail?: string | null;
  art?: React.ReactNode;
  on: boolean;
  onClick: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        aria-pressed={on}
        className={cn(
          "flex w-full cursor-pointer items-center gap-3 rounded-[var(--radius-control)] px-2 py-2 text-left",
          on ? "bg-accent/10" : "hover:bg-elevated",
        )}
      >
        {art}
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span
            className={cn(
              "text-sm font-semibold",
              on ? "text-accent" : "text-text-primary",
            )}
          >
            {label}
          </span>
          {detail && <span className="text-xs text-text-muted">{detail}</span>}
        </span>
        {on && <Check className="size-5 shrink-0 text-accent" aria-hidden="true" />}
      </button>
    </li>
  );
}

/**
 * Which printing, down a list with each one's art: "Any printing"
 * first, the one chosen ticked. Choosing one closes the sheet.
 */
export function PrintingSheet({
  open,
  name,
  printings,
  value,
  onPick,
  onClose,
}: {
  open: boolean;
  name: string;
  printings: { id: string; label: string; imageUrl: string | null }[];
  value: string | null;
  onPick: (printingId: string | null) => void;
  onClose: () => void;
}) {
  const choose = (id: string | null) => {
    onPick(id);
    onClose();
  };
  return (
    <Sheet open={open} onClose={onClose} title={`Which ${name}?`}>
      <ul className="flex flex-col gap-1">
        <OptionRow
          label="Any printing"
          detail="Whichever version they have"
          on={value === null}
          onClick={() => choose(null)}
        />
        {printings.map((printing) => (
          <OptionRow
            key={printing.id}
            label={printing.label}
            on={value === printing.id}
            onClick={() => choose(printing.id)}
            art={
              <span className="block h-14 w-10 shrink-0 overflow-hidden rounded-[4px] border border-border bg-elevated">
                {printing.imageUrl && (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={printing.imageUrl}
                    alt=""
                    className="size-full object-contain"
                  />
                )}
              </span>
            }
          />
        ))}
      </ul>
    </Sheet>
  );
}

export type HuntPick =
  { kind: "none" } | { kind: "existing"; id: string } | { kind: "new"; name: string };

/** What the hunt row says: the hunt's name, a new one's, or None. */
export function huntRowValue(
  value: HuntPick,
  hunts: { id: string; name: string }[],
): string {
  if (value.kind === "none") return "None";
  if (value.kind === "new") return value.name.trim() || "New hunt";
  return hunts.find((hunt) => hunt.id === value.id)?.name ?? "None";
}

/** Which hunt these cards go in: none, one of theirs, or a new one named here. */
export function HuntSheet({
  open,
  hunts,
  value,
  onChange,
  onClose,
}: {
  open: boolean;
  hunts: { id: string; name: string }[];
  value: HuntPick;
  onChange: (next: HuntPick) => void;
  onClose: () => void;
}) {
  const [naming, setNaming] = useState(value.kind === "new");
  const [name, setName] = useState(value.kind === "new" ? value.name : "");
  const choose = (next: HuntPick) => {
    onChange(next);
    onClose();
  };

  return (
    <Sheet open={open} onClose={onClose} title="Add to a hunt">
      <div className="flex flex-col gap-3">
        <p className="text-sm text-text-muted">
          Building a deck? Keep these cards together with what is found.
        </p>
        <ul className="flex flex-col gap-1">
          <OptionRow
            label="No hunt"
            on={value.kind === "none"}
            onClick={() => choose({ kind: "none" })}
          />
          {hunts.map((hunt) => (
            <OptionRow
              key={hunt.id}
              label={hunt.name}
              on={value.kind === "existing" && value.id === hunt.id}
              onClick={() => choose({ kind: "existing", id: hunt.id })}
            />
          ))}
          {!naming && (
            <OptionRow
              label="Start a new hunt"
              on={false}
              onClick={() => setNaming(true)}
              art={<PlusCircle className="size-5 text-accent" aria-hidden="true" />}
            />
          )}
        </ul>
        {naming && (
          <div className="flex flex-col gap-2">
            <TextInput
              value={name}
              onChange={(event) => setName(event.target.value.slice(0, 60))}
              maxLength={60}
              placeholder="Name it, like Green Zoro"
              aria-label="Hunt name"
              autoFocus
            />
            <Button
              type="button"
              disabled={!name.trim()}
              onClick={() => choose({ kind: "new", name: name.trim() })}
            >
              Start this hunt
            </Button>
          </div>
        )}
      </div>
    </Sheet>
  );
}
