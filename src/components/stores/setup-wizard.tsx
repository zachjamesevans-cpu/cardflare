import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, MonitorPlay } from "lucide-react";

import { Card } from "@/components/ui/card";
import { buttonStyles } from "@/components/ui/button";
import {
  nextSetupStep,
  SETUP_STEPS,
  setupHref,
  type SetupStep,
} from "@/lib/stores/setup-schema";

/**
 * The frame every step of the wizard sits in.
 *
 * The founder: "needs to be a great onboarding experience." Which
 * means, above all, that nobody is trapped in it: every step has a
 * Skip that is exactly as reachable as Next, both go to the same
 * place, and the step is kept in the URL so the back button and a
 * refresh both work. The state of the store is the only state.
 */
export function StepFrame({
  storeId,
  step,
  title,
  lede,
  children,
}: {
  storeId: string;
  step: SetupStep;
  title: string;
  lede: string;
  children: ReactNode;
}) {
  const at = SETUP_STEPS.indexOf(step) + 1;
  const next = nextSetupStep(step);

  return (
    <section className="flex flex-col gap-5" aria-labelledby="step-heading">
      <div className="flex flex-col gap-2">
        <p className="text-xs font-semibold tracking-[0.18em] text-accent uppercase">
          Step {at} of {SETUP_STEPS.length}
        </p>
        <h2
          id="step-heading"
          className="text-2xl font-bold tracking-tight text-text-primary sm:text-3xl"
        >
          {title}
        </h2>
        <p className="max-w-2xl text-text-secondary">{lede}</p>
      </div>

      {children}

      {next && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            href={setupHref(storeId, next)}
            className="text-sm text-text-muted underline-offset-4 hover:text-text-secondary hover:underline"
          >
            Skip for now
          </Link>
          <Link
            href={setupHref(storeId, next)}
            className={buttonStyles("primary", "md")}
          >
            Next
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </div>
      )}
    </section>
  );
}

/** The dots along the top: where you are, and a way back to any step. */
export function StepDots({ storeId, step }: { storeId: string; step: SetupStep }) {
  const at = SETUP_STEPS.indexOf(step);
  return (
    <ol className="flex items-center gap-2" aria-label="Setup steps">
      {SETUP_STEPS.map((name, index) => (
        <li key={name}>
          <Link
            href={setupHref(storeId, name)}
            aria-current={index === at ? "step" : undefined}
            aria-label={`Step ${index + 1}: ${STEP_TITLES[name]}`}
            className={
              index === at
                ? "block h-2 w-6 rounded-full bg-accent"
                : index < at
                  ? "block size-2 rounded-full bg-accent/50"
                  : "block size-2 rounded-full bg-border-strong"
            }
          />
        </li>
      ))}
    </ol>
  );
}

export const STEP_TITLES: Record<SetupStep, string> = {
  welcome: "Welcome",
  page: "Your store page",
  screens: "Your screens",
  event: "Your first event night",
  team: "Your team",
  done: "Done",
};

/**
 * One television, with the link that goes on it. What to do with the
 * link is said once, in the step's lede, not under every row.
 */
export function ScreenRow({
  name,
  url,
  qrSvg,
  manageHref,
}: {
  name: string;
  url: string;
  qrSvg: string;
  manageHref: string;
}) {
  return (
    <Card as="li" className="flex flex-wrap items-start gap-4">
      <div
        className="w-24 shrink-0 rounded-md bg-white p-1"
        /* Generated server-side by the `qrcode` package from a URL this
           app built, never from user input. */
        dangerouslySetInnerHTML={{ __html: qrSvg }}
      />
      <div className="flex min-w-0 flex-1 basis-56 flex-col gap-1">
        <p className="flex items-center gap-2 font-semibold text-text-primary">
          <MonitorPlay className="size-4 text-accent" aria-hidden="true" />
          {name}
        </p>
        <p className="font-mono text-xs break-all text-text-secondary">{url}</p>
        <Link
          href={manageHref}
          className="text-sm font-semibold text-accent underline-offset-4 hover:underline"
        >
          Manage this screen
        </Link>
      </div>
    </Card>
  );
}
