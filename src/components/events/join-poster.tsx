import { Card } from "@/components/ui/card";
import { PrintButton } from "./print-button";
import { SITE } from "@/lib/site";

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
 */
export function JoinPoster({
  eventName,
  joinCode,
  url,
  qrSvg,
}: {
  eventName: string;
  joinCode: string;
  url: string;
  qrSvg: string;
}) {
  return (
    <div className="flex flex-col gap-4">
      <Card className="print:border-0 print:p-0 print:shadow-none">
        <div className="mx-auto flex max-w-md flex-col items-center gap-6 rounded-[var(--radius-card)] bg-white p-8 text-center text-black">
          <div className="flex flex-col gap-1">
            <p className="text-sm font-semibold tracking-[0.2em] text-neutral-500 uppercase">
              {SITE.name}
            </p>
            <h3 className="text-2xl font-bold text-balance">{eventName}</h3>
          </div>

          <div
            className="w-full max-w-[260px]"
            /*
             * Generated server-side by the `qrcode` package from a URL this
             * app built — never from user input — so there is no untrusted
             * markup here. It is inlined rather than fetched as an image so
             * printing cannot race an outstanding request.
             */
            dangerouslySetInnerHTML={{ __html: qrSvg }}
          />

          <div className="flex flex-col gap-2">
            <p className="text-sm text-neutral-600">Scan, or go to</p>
            <p className="text-lg font-semibold break-all">{SITE.domain}/join</p>
            <p className="text-sm text-neutral-600">and enter</p>
            <p className="font-mono text-4xl font-bold tracking-[0.25em]">{joinCode}</p>
          </div>
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
