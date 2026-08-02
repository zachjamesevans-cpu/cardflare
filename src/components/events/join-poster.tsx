import Image from "next/image";

import { Card } from "@/components/ui/card";
import { PrintButton } from "./print-button";
import { SITE } from "@/lib/site";
import mark from "@public/brand/cardflare-mark.png";

/**
 * The thing that actually goes on the counter.
 *
 * Printed on white with a black QR regardless of the app's dark theme: a QR
 * code needs a light quiet zone and high contrast to scan, and inverting it is
 * a well-known way to make a code that reads on screen and fails on paper.
 *
 * The typed code is shown as prominently as the QR. Plenty of people will not
 * scan — an older phone, a locked-down camera, a cracked screen — and the
 * fallback has to look like a first-class route in, not a consolation.
 *
 * `data-print-sheet` is what the print rules in globals.css key off. Without
 * them the sheet printed with the whole console around it: header, sign-out
 * button, status controls, breadcrumb.
 */

/** The mark is taller than it is wide; height leads and width follows. */
const MARK_HEIGHT = 30;
const MARK_ASPECT = mark.width / mark.height;

/**
 * What a player can actually do, in order.
 *
 * The third step used to stop at "you're in the room", because posting cards
 * did not exist yet and a sheet taped to a counter must not promise a feature
 * nobody can use. It exists now, and it is the reason to scan at all.
 */
const STEPS = ["Scan the code", "Enter your name", "Post the cards you need"];

function BrandLockup() {
  return (
    <div className="flex items-center gap-2.5">
      {/*
       * The mark sits on the brand backdrop rather than on bare paper. Its
       * card face is dark and much of the artwork is near-white, so on white it
       * would half disappear — the same reason BRAND.md puts the favicons on
       * this backdrop. The artwork itself is untouched.
       */}
      <span className="flex items-center justify-center rounded-[7px] bg-[#12151b] px-2 py-1.5 print-exact">
        <Image
          src={mark}
          alt=""
          aria-hidden="true"
          width={Math.round(MARK_HEIGHT * MARK_ASPECT)}
          height={MARK_HEIGHT}
        />
      </span>
      <span className="text-lg font-bold tracking-tight text-black">{SITE.name}</span>
    </div>
  );
}

export function JoinPoster({
  eventName,
  eventWindow,
  eyebrow = "Trading here today",
  joinCode,
  url,
  qrSvg,
}: {
  eventName: string;
  /** Human-readable date and time. Useful on a sheet that outlives the day. */
  eventWindow?: string | null;
  /**
   * The line above the name.
   *
   * A store's counter sheet is laminated and left up for a year, so it says
   * something evergreen; an event sheet is printed for one night and can say
   * "today" honestly.
   */
  eyebrow?: string;
  joinCode: string;
  url: string;
  qrSvg: string;
}) {
  return (
    <div className="flex flex-col gap-4">
      <Card className="print:border-0 print:p-0 print:shadow-none">
        <div
          data-print-sheet
          className="mx-auto flex max-w-md flex-col items-center gap-7 rounded-[var(--radius-card)] bg-white px-8 py-10 text-center text-black print:max-w-[150mm] print:gap-5 print:rounded-none print:p-0"
        >
          <BrandLockup />

          <div className="flex flex-col gap-2">
            <p className="text-xs font-semibold tracking-[0.22em] text-neutral-500 uppercase">
              {eyebrow}
            </p>
            <h3 className="text-3xl font-bold text-balance">{eventName}</h3>
            {eventWindow && (
              <p className="text-sm text-neutral-600 print:text-base">{eventWindow}</p>
            )}
          </div>

          <div
            className="w-full max-w-[280px] print:max-w-[300px]"
            /*
             * Generated server-side by the `qrcode` package from a URL this
             * app built — never from user input — so there is no untrusted
             * markup here. It is inlined rather than fetched as an image so
             * printing cannot race an outstanding request.
             */
            dangerouslySetInnerHTML={{ __html: qrSvg }}
          />

          <p className="-mt-3 text-sm font-medium text-neutral-700">Scan to join</p>

          {/*
           * A rule with the word sitting in it, so the typed code reads as an
           * equal way in rather than an afterthought.
           */}
          <div
            className="flex w-full items-center gap-3 text-xs tracking-[0.2em] text-neutral-400 uppercase"
            aria-hidden="true"
          >
            <span className="h-px flex-1 bg-neutral-200" />
            or
            <span className="h-px flex-1 bg-neutral-200" />
          </div>

          <div className="flex flex-col gap-2">
            <p className="text-sm text-neutral-600">
              Go to <span className="font-semibold text-black">{SITE.domain}/join</span>
            </p>
            <p className="text-sm text-neutral-600">and enter this code</p>
            <p className="font-mono text-5xl font-bold tracking-[0.25em]">{joinCode}</p>
          </div>

          <ol className="mx-auto flex w-full max-w-[15rem] flex-col gap-2.5 border-t border-neutral-200 pt-6 text-left">
            {STEPS.map((step, index) => (
              <li key={step} className="flex items-center gap-3 text-sm">
                <span
                  className="flex size-6 shrink-0 items-center justify-center rounded-full bg-neutral-900 text-xs font-bold text-white print-exact"
                  aria-hidden="true"
                >
                  {index + 1}
                </span>
                <span className="text-neutral-700">{step}</span>
              </li>
            ))}
          </ol>

          <p className="text-xs tracking-[0.15em] text-neutral-400 uppercase">
            {SITE.domain}
          </p>
        </div>
      </Card>

      <div className="flex flex-wrap items-center gap-3 print:hidden">
        <PrintButton />
        <p className="text-sm break-all text-text-muted">
          Links to <span className="text-text-secondary">{url}</span>
        </p>
      </div>
    </div>
  );
}
