"use client";

import { useState } from "react";
import Link from "next/link";
import { KeyRound, QrCode } from "lucide-react";

import { Sheet } from "@/components/ui/sheet";
import { SCAN_OR_CODE } from "@/lib/events/going-copy";
import { ENTER_CODE } from "@/lib/events/night-copy";

/**
 * The small QR icon at the top right of Nights, and the sheet behind it.
 *
 * The founder (2026-10-03): "a small QR/code icon button top-right. Do
 * NOT use a giant 'Scan or enter a code' button. Tapping the QR icon
 * can open: Scan QR / Enter event code manually." The app's sheet has
 * both rows, since a phone has a camera. The website has no scanner
 * (the /room door takes a typed code, and a printed QR is scanned by
 * the phone's own camera, which lands on /e/CODE directly), so this
 * sheet shows the one row that does something: a "Scan QR" row that
 * opened the same code form would be a button that does not do what it
 * says. The app's nights.tsx draws the same icon with the same label;
 * tests/unit/nights2-parity.test.ts holds the two together.
 */
export function CodeSheet() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-label={SCAN_OR_CODE}
        title={SCAN_OR_CODE}
        className="inline-flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-full border border-border bg-surface text-text-secondary transition-colors hover:border-border-strong hover:text-text-primary focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
      >
        <QrCode className="size-4" aria-hidden="true" />
      </button>

      <Sheet open={open} onClose={() => setOpen(false)} title={SCAN_OR_CODE}>
        <ul className="flex flex-col">
          <li>
            <Link
              href="/room"
              className="flex items-center gap-3 rounded-[var(--radius-control)] px-2 py-3 text-text-primary transition-colors hover:bg-elevated"
            >
              <KeyRound className="size-4 text-text-muted" aria-hidden="true" />
              <span className="font-medium">{ENTER_CODE}</span>
            </Link>
          </li>
        </ul>
      </Sheet>
    </>
  );
}
