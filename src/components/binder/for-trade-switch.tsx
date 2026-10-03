"use client";

/**
 * The one switch a binder has: Up for trade. On, the binder is open
 * to every signed-in player and its cards are the ones nearby hunters
 * hear about; off, only the owner opens it and its cards take no part
 * in anything. The founder: "Anything that's public is up for trade."
 *
 * Drawn in the create dialog and in the settings strip, from here, so
 * the two say the same words and look the same. The app's
 * create-binder-sheet.tsx and Binder screen use the same line.
 */

/** Under the switch, wherever it is drawn. */
export const FOR_TRADE_LINE = "People nearby hunting one of these cards hear about it.";

export function ForTradeSwitch({
  on,
  disabled = false,
  onChange,
}: {
  on: boolean;
  disabled?: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 rounded-[var(--radius-control)] border border-border bg-elevated p-3">
      <span className="flex min-w-0 flex-col">
        <span className="text-sm font-semibold text-text-primary">Up for trade</span>
        <span className="text-xs text-text-muted">{FOR_TRADE_LINE}</span>
      </span>
      <input
        type="checkbox"
        role="switch"
        checked={on}
        aria-checked={on}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="size-5 shrink-0 cursor-pointer rounded-[6px] border border-border-strong bg-canvas accent-accent"
      />
    </label>
  );
}
