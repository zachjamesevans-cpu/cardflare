"use client";

import { CheckCircle2 } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * "Your Flare is up", over the Feed just after a post, then gone: so the
 * Feed never looks unchanged after posting. The founder: "there should
 * be some type of loading thing or visual context that your flare is
 * posting so you're not like wtf where is my flare." The website reaches
 * the Feed with the post already in it, so it says it is up. The app's
 * PostingLine (home.tsx) is the same.
 */
export function PostedLine() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const posted = params.get("posted") === "1";
  const note = params.get("note");
  const [shown, setShown] = useState(posted);

  useEffect(() => {
    if (!posted) return;
    const timer = window.setTimeout(() => {
      setShown(false);
      /* Off the address, so a reload does not say it again. */
      router.replace(pathname, { scroll: false });
    }, 3200);
    return () => window.clearTimeout(timer);
  }, [posted, pathname, router]);

  if (!posted || !shown) return null;
  return (
    <div
      role="status"
      className="cf-sheet-backdrop-in fixed inset-x-4 top-20 z-[60] mx-auto flex max-w-md items-center gap-2.5 rounded-[14px] border border-accent/40 bg-elevated px-4 py-3 shadow-[var(--shadow-panel)]"
    >
      <CheckCircle2 className="size-5 shrink-0 text-accent" aria-hidden="true" />
      <span className="flex min-w-0 flex-col">
        <span className="font-extrabold text-accent">Your Flare is up</span>
        {note && <span className="text-sm text-text-secondary">{note}</span>}
      </span>
    </div>
  );
}
