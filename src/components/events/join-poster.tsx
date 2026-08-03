import Image from "next/image";

import { Card } from "@/components/ui/card";
import { PrintButton } from "./print-button";
import { SITE } from "@/lib/site";
import mark from "@public/brand/cardflare-mark.png";

/**
 * The thing that actually goes on the counter, laid out as a trading card.
 *
 * A plain sheet of A4 with a QR on it gets ignored. Players at a card shop
 * already know how to read a card at a glance — name at the top, art in the
 * middle, rules underneath, collector number along the bottom — so borrowing
 * that anatomy makes the sheet legible before anyone has read a word of it,
 * and it looks like it belongs on a counter covered in card product.
 *
 * **Generic card anatomy, never One Piece trade dress.** The frame, the type
 * line and the text box are common to every TCG printed since 1993. Nothing
 * here copies Bandai's borders, colour language, cost bubbles or iconography,
 * and nothing may be mistaken for a real card or imply a licence CardFlare
 * does not have — the same line the artwork placeholder holds.
 *
 * Printed on white with a black QR regardless of the app's dark theme: a QR
 * code needs a light quiet zone and high contrast to scan, and inverting it is
 * a well-known way to make a code that reads on screen and fails on paper.
 *
 * **It has to survive a mono printer.** A shop's front desk is as likely to
 * have a black-and-white laser as anything, and the brand green sits at about
 * 85% luminance — as grey it is nearly white. So the accent is decoration
 * only: rules, corner flourishes, a tint behind the type line. Everything that
 * has to be *read* is black on white, and the step numbers stay white on black.
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
const MARK_HEIGHT = 26;
const MARK_ASPECT = mark.width / mark.height;

/**
 * What a player can actually do, in order.
 *
 * The third step used to stop at "you're in the room", because posting cards
 * did not exist yet and a sheet taped to a counter must not promise a feature
 * nobody can use. It exists now, and it is the reason to scan at all.
 */
const STEPS = ["Scan the code", "Enter your name", "Post the cards you need"];

/**
 * The game, on the type line.
 *
 * A constant rather than a prop because there is exactly one: `events.game` is
 * an enum with a single value, and a store has no game at all. It becomes a
 * prop on the day a second game exists, which is a schema change anyway.
 */
const GAME = "One Piece Card Game";

export type PosterKind = "event" | "counter" | "show";

/** The card's type line, and what the room actually is. */
const TYPE_LINE: Record<PosterKind, string> = {
  event: "Event Room",
  counter: "Trade Anytime",
  show: "Card Show",
};

function BrandLockup() {
  return (
    <div className="flex items-center gap-2">
      {/*
       * The mark sits on the brand backdrop rather than on bare paper. Its
       * card face is dark and much of the artwork is near-white, so on white it
       * would half disappear — the same reason BRAND.md puts the favicons on
       * this backdrop. The artwork itself is untouched.
       */}
      <span className="flex items-center justify-center rounded-[6px] bg-[#12151b] px-1.5 py-1 print-exact">
        <Image
          src={mark}
          alt=""
          aria-hidden="true"
          width={Math.round(MARK_HEIGHT * MARK_ASPECT)}
          height={MARK_HEIGHT}
        />
      </span>
      <span className="text-base font-bold tracking-tight text-black">{SITE.name}</span>
    </div>
  );
}

export function JoinPoster({
  title,
  subtitle,
  kind,
  joinCode,
  url,
  qrSvg,
}: {
  /** The card's name: the event, or the store. */
  title: string;
  /** Under the name. A date and time for an event; nothing for a counter. */
  subtitle?: string | null;
  kind: PosterKind;
  joinCode: string;
  url: string;
  qrSvg: string;
}) {
  return (
    <div className="flex flex-col gap-4">
      <Card className="print:border-0 print:p-0 print:shadow-none">
        <div
          data-print-sheet
          /*
           * `p-[3mm]` is the card's outer black edge, the way a real card has
           * a border before its frame starts. Everything inside is the frame.
           */
          /*
           * Sized to fill the sheet. 170mm fits inside both A4 (182mm of
           * printable width at these margins) and US Letter (188mm), and the
           * height that follows clears Letter's 251mm — the shorter of the two
           * — with room to spare for a store name that wraps.
           *
           * The earlier version was 150mm and content-height, which left a
           * small card marooned in the top third of an otherwise blank page.
           * On a counter that reads as a leftover printout rather than as
           * signage.
           */
          className="mx-auto flex max-w-md flex-col rounded-[16px] bg-black p-[3mm] text-black print-exact print:max-w-[170mm]"
        >
          <div className="flex flex-col gap-[3mm] rounded-[10px] border border-neutral-300 bg-white p-[4mm]">
            {/* ---- Name bar ------------------------------------------- */}
            <div className="flex items-start justify-between gap-3 border-b-2 border-black pb-[3mm]">
              <div className="flex min-w-0 flex-col gap-0.5">
                <h3 className="text-2xl leading-tight font-bold text-balance print:text-[26pt]">
                  {title}
                </h3>
                {subtitle && (
                  <p className="text-xs text-neutral-600 print:text-[9pt]">
                    {subtitle}
                  </p>
                )}
              </div>
              <BrandLockup />
            </div>

            {/* ---- Art window: the QR ---------------------------------- */}
            {/*
             * `p-[6mm]` is the QR's quiet zone, not decoration.
             *
             * The generator emits a one-module margin, which at this printed
             * size is about 3.4mm — under the four modules the spec asks for,
             * and the art window's black border sits right outside it. Padding
             * the window carries the total to roughly three and a half
             * modules of clear white before anything high-contrast begins.
             */}
            <div className="relative rounded-[6px] border-2 border-black bg-white p-[6mm]">
              {/*
               * Corner ticks, the way a card's art window is framed. Accent
               * only — they carry no information, so losing them to a mono
               * printer costs nothing.
               */}
              {[
                "top-[-1px] left-[-1px] border-t-4 border-l-4 rounded-tl-[6px]",
                "top-[-1px] right-[-1px] border-t-4 border-r-4 rounded-tr-[6px]",
                "bottom-[-1px] left-[-1px] border-b-4 border-l-4 rounded-bl-[6px]",
                "bottom-[-1px] right-[-1px] border-b-4 border-r-4 rounded-br-[6px]",
              ].map((position) => (
                <span
                  key={position}
                  aria-hidden="true"
                  className={`absolute size-5 border-[#a6cc2e] print-exact ${position}`}
                />
              ))}

              <div
                className="mx-auto w-full max-w-[105mm]"
                /*
                 * Generated server-side by the `qrcode` package from a URL this
                 * app built — never from user input — so there is no untrusted
                 * markup here. It is inlined rather than fetched as an image so
                 * printing cannot race an outstanding request.
                 */
                dangerouslySetInnerHTML={{ __html: qrSvg }}
              />
            </div>

            {/* ---- Type line ------------------------------------------- */}
            <div className="flex items-center justify-between gap-3 rounded-[4px] border border-neutral-300 bg-[#eef7d4] px-[3mm] py-[2mm] print-exact">
              <p className="text-[11px] font-bold tracking-[0.1em] uppercase print:text-[9pt]">
                {TYPE_LINE[kind]}
              </p>
              <p className="truncate text-[11px] font-medium text-neutral-700 print:text-[9pt]">
                {GAME}
              </p>
            </div>

            {/* ---- Rules text ------------------------------------------ */}
            <div className="flex flex-col gap-[3mm] rounded-[4px] border border-neutral-200 bg-neutral-50 px-[4mm] py-[3mm] print-exact">
              <p className="text-center text-base font-bold print:text-[14pt]">
                Scan to find cards from people in this room
              </p>

              <ol className="mx-auto flex w-full max-w-[64mm] flex-col gap-[2mm]">
                {STEPS.map((step, index) => (
                  <li key={step} className="flex items-center gap-2.5 text-sm">
                    <span
                      className="flex size-5 shrink-0 items-center justify-center rounded-full bg-black text-[11px] font-bold text-white print-exact"
                      aria-hidden="true"
                    >
                      {index + 1}
                    </span>
                    <span className="text-neutral-800 print:text-[11.5pt]">{step}</span>
                  </li>
                ))}
              </ol>

              {/*
               * The typed route in, given its own panel rather than a footnote.
               * A dashed rule reads as "or", and keeps it from looking like the
               * small print nobody reads.
               */}
              <div className="flex flex-col items-center gap-1 border-t border-dashed border-neutral-300 pt-[3mm]">
                <p className="text-xs text-neutral-600 print:text-[9pt]">
                  No camera? Go to{" "}
                  <span className="font-semibold text-black">{SITE.domain}/join</span>{" "}
                  and enter
                </p>
                <p className="font-mono text-[30px] leading-none font-bold tracking-[0.18em] print:text-[32pt]">
                  {joinCode}
                </p>
              </div>
            </div>

            {/* ---- Collector line -------------------------------------- */}
            <div className="flex items-center justify-between gap-3 text-[10px] tracking-[0.12em] text-neutral-500 uppercase print:text-[8pt]">
              <span className="font-mono">{joinCode}</span>
              <span>{SITE.domain}</span>
            </div>
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
