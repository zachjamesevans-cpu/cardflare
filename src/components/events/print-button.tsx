"use client";

import { Printer } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Opens the browser's print dialog.
 *
 * The only reason this file is a Client Component. Everything else about the
 * poster is server-rendered, and the poster prints correctly from the
 * browser's own menu too — this is a shortcut, not the mechanism.
 */
export function PrintButton() {
  return (
    <Button type="button" variant="secondary" onClick={() => window.print()}>
      <Printer className="size-4" aria-hidden="true" />
      Print
    </Button>
  );
}
