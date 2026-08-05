"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Copies the join URL, and says so.
 *
 * The feedback matters more than the copy: without "Copied" the button
 * gives no sign anything happened, and people press it four times.
 */
export function CopyLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard refused (permissions, http): the link beside the button
      // is selectable, so there is still a way; no error state needed.
    }
  }

  return (
    <Button type="button" variant="ghost" size="sm" onClick={copy}>
      {copied ? (
        <>
          <Check className="size-4 text-accent" aria-hidden="true" />
          Copied
        </>
      ) : (
        <>
          <Copy className="size-4" aria-hidden="true" />
          Copy link
        </>
      )}
    </Button>
  );
}
