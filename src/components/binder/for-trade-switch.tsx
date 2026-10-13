"use client";

/**
 * Up for trade: on, the binder is open to every signed-in player and
 * its cards are the ones nearby hunters hear about. It was the one
 * switch a binder had ("Anything that's public is up for trade") until
 * Show on your profile (PublicSwitch, below) split public from trade:
 * a binder can be shown without its cards being up. Up for trade is
 * always shown; with both off, only the owner opens it.
 *
 * Drawn in the create dialog and in the settings strip, from here, so
 * the two say the same words and look the same. The app's
 * create-binder-sheet.tsx and Binder screen use the same line.
 */

/** Under the switch, wherever it is drawn. */
export const FOR_TRADE_LINE = "People nearby hunting one of these cards hear about it.";

/**
 * Show on your profile: public without being up for trade. The founder:
 * "sometimes you don't necessarily want something up for trade, but also
 * want it visible on your profile". Held on while the binder is up for
 * trade, since anything up for trade is shown. The app's Binder screen
 * and create sheet say the same words.
 */
export function PublicSwitch({
  on,
  forTrade,
  disabled = false,
  onChange,
}: {
  on: boolean;
  forTrade: boolean;
  disabled?: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 rounded-[var(--radius-control)] border border-border bg-elevated p-3">
      <span className="flex min-w-0 flex-col">
        <span className="text-sm font-semibold text-text-primary">
          Show on your profile
        </span>
        <span className="text-xs text-text-muted">
          {forTrade
            ? "Always shown while it is up for trade."
            : "Anyone who opens your profile can look through it."}
        </span>
      </span>
      <input
        type="checkbox"
        role="switch"
        checked={on || forTrade}
        aria-checked={on || forTrade}
        disabled={disabled || forTrade}
        onChange={(event) => onChange(event.target.checked)}
        className="size-5 shrink-0 cursor-pointer rounded-[6px] border border-border-strong bg-canvas accent-accent"
      />
    </label>
  );
}

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
