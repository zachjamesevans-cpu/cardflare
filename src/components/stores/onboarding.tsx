import Link from "next/link";
import { ArrowRight, Check, Circle } from "lucide-react";

import { UltraMark } from "@/components/stores/ultra-mark";
import { Card } from "@/components/ui/card";
import { SITE } from "@/lib/site";

/**
 * The welcome, and the checklist that follows it.
 *
 * The founder, after his own trial: "first thing I see is a button
 * that says start your 14 day free trial" and "a big welcome to
 * cardflare ultra so they feel welcomed." So: `WelcomeHero` opens the
 * setup wizard at /store/setup with the tier's name on it and the
 * trial's end date when there is one. `SetupChecklist` is the console
 * home's list of what is still to do once the wizard is finished or
 * skipped: each step ticked as it is done and each a link to the tab
 * where it happens, and the card leaves when nothing is left.
 */
export interface SetupStep {
  key: string;
  title: string;
  detail: string;
  done: boolean;
  href: string;
  action: string;
}

export function WelcomeHero({
  storeName,
  trialUntil,
  fresh,
  onUltra,
}: {
  storeName: string;
  /** Printed when the trial's first charge date is known. */
  trialUntil: string | null;
  /** Straight from checkout: the biggest welcome. */
  fresh: boolean;
  /**
   * Whether Ultra is on. An invited store arrives before its trial, and
   * welcoming it "to cardflare Ultra" read as a plan it did not have yet,
   * beside a Settings page asking for a card.
   */
  onUltra: boolean;
}) {
  return (
    <Card className="flex flex-col gap-3 border-accent">
      <p className="text-xs font-semibold tracking-[0.18em] text-accent uppercase">
        {fresh ? "You are in" : "Getting set up"}
      </p>
      <h2 className="text-3xl font-bold tracking-tight text-text-primary sm:text-4xl">
        Welcome to {SITE.name}
        {onUltra && (
          <>
            {" "}
            <UltraMark />
          </>
        )}
      </h2>
      <p className="max-w-2xl text-text-secondary">
        {onUltra
          ? `${storeName} is on. Your counter code is ready to print, and the next four steps put the rest of Ultra to work: your page, your screens, your first night and your team.`
          : `${storeName} is on ${SITE.name}: players scan your counter code and find the cards they need from each other, right in your store. Start your Ultra trial to put FlareCast on your TV with Auto Mode running the rounds, match your singles to every Flare and post to your followers.`}
        {trialUntil &&
          ` Your free trial runs until ${trialUntil}; nothing is charged before then.`}
      </p>
    </Card>
  );
}

export function SetupChecklist({ steps }: { steps: SetupStep[] }) {
  const done = steps.filter((step) => step.done).length;

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <h3 className="font-semibold text-text-primary">Do these first</h3>
        <span className="text-sm text-text-muted tabular-nums">
          {done} of {steps.length} done
        </span>
      </div>
      <ol className="flex flex-col">
        {steps.map((step) => (
          <li
            key={step.key}
            className="flex flex-wrap items-center gap-3 border-t border-border py-3 first:border-t-0 first:pt-0 last:pb-0"
          >
            {step.done ? (
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent text-accent-contrast">
                <Check className="size-4" aria-hidden="true" />
              </span>
            ) : (
              <Circle
                className="size-6 shrink-0 text-border-strong"
                aria-hidden="true"
              />
            )}
            <div className="flex min-w-0 flex-1 basis-56 flex-col">
              <span
                className={
                  step.done
                    ? "font-semibold text-text-muted line-through"
                    : "font-semibold text-text-primary"
                }
              >
                {step.title}
              </span>
              <span className="text-sm text-text-secondary">{step.detail}</span>
            </div>
            {!step.done && (
              <Link
                href={step.href}
                className="flex items-center gap-1.5 text-sm font-semibold text-accent underline-offset-4 hover:underline"
              >
                {step.action}
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            )}
          </li>
        ))}
      </ol>
    </Card>
  );
}
