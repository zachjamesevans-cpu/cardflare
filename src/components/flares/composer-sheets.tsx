"use client";

import { Check, ChevronRight, Crosshair, X, type LucideIcon } from "lucide-react";

import { Sheet } from "@/components/ui/sheet";
import { cn } from "@/lib/cn";

/**
 * The composer's printing as a row that says what is chosen and a
 * sheet that lists the options down, and the hunt it was opened from. The
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

/**
 * The one sign of a hunt in the composer: "Adding to Green Zoro", and
 * only when it was opened from that hunt's "+". There is no picker any
 * more. The founder: "okay, im posting a flare, but also adding to a
 * hunt? ... i think it's a bit convoluted when you're posting a
 * flare." A Flare is the cards you are looking for; a hunt is built on
 * its own screen. The cross posts the same cards as a plain Flare.
 */
export function AddingToHunt({
  name,
  onLeave,
}: {
  name: string | null;
  onLeave: () => void;
}) {
  return (
    <div className="flex w-full items-center gap-2.5 rounded-[var(--radius-control)] border border-border bg-elevated py-1.5 pr-1.5 pl-3">
      <Crosshair className="size-4 shrink-0 text-accent" aria-hidden="true" />
      <p className="min-w-0 flex-1 truncate text-sm text-text-secondary">
        Adding to{" "}
        <span className="font-semibold text-text-primary">{name ?? "your hunt"}</span>
      </p>
      <button
        type="button"
        onClick={onLeave}
        aria-label="Post without the hunt"
        className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full text-text-muted hover:text-text-primary"
      >
        <X className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}
