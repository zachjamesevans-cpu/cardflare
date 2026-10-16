"use client";

import { useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useState, useTransition } from "react";

import { BackLink } from "@/components/ui/back-link";
import { saveLookAction } from "@/lib/players/equip-actions";
import type { EquipKind } from "@/lib/players/equips";
import { cn } from "@/lib/cn";

/**
 * Edit profile's picks, held until Done.
 *
 * The founder: "i think we need a 'done' button. it seems like no
 * cosmetics saved when i applied them... the second i press done or
 * whatever, it updates on my account and the server stuff happens in
 * the background. if it doesn't save, it'll just revert back." A tile
 * click stages here; Done saves the lot in one action and goes to the
 * profile; a refusal puts the picks back and says so. The app's
 * Edit profile does the same (mobile/src/look-save.ts).
 */

/** The slots that changed, as the slug now worn or null for none. */
export type LookDraft = Partial<Record<EquipKind, string | null>>;

const LOOK_FAILED = "Your look did not save, so it is back as it was. Try again.";
const LOOK_NOT_PRO = "Wearing cosmetics is a cardflare Pro feature.";
const DISCARD = "Discard your changes? What you picked has not been saved.";

interface LookDraftValue {
  draft: LookDraft;
  /** Stage a pick; picking what is already saved un-stages it. */
  pick: (kind: EquipKind, slug: string | null, saved: string | null) => void;
}

const LookDraftContext = createContext<LookDraftValue | null>(null);

export function useLookDraft(): LookDraftValue {
  const value = useContext(LookDraftContext);
  if (!value) throw new Error("useLookDraft outside LookDraftProvider");
  return value;
}

/** Back and Done over the tabs, holding what the tabs pick. */
export function LookDraftProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [draft, setDraft] = useState<LookDraft>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, start] = useTransition();
  const dirty = Object.keys(draft).length > 0;

  /* A reload or a closed tab with picks unsaved asks first too. */
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const pick: LookDraftValue["pick"] = (kind, slug, saved) => {
    setError(null);
    setDraft((current) => {
      const next = { ...current };
      if (slug === saved) delete next[kind];
      else next[kind] = slug;
      return next;
    });
  };

  const done = () => {
    if (!dirty) {
      router.push("/profile");
      return;
    }
    start(async () => {
      const outcome = await saveLookAction(
        Object.entries(draft).map(([kind, slug]) => ({ kind, slug: slug ?? null })),
      );
      if (outcome === "saved") {
        setDraft({});
        router.push("/profile");
        return;
      }
      /* Back as it was: the server's look, and a line saying why. */
      setDraft({});
      setError(outcome === "not-pro" ? LOOK_NOT_PRO : LOOK_FAILED);
      router.refresh();
    });
  };

  return (
    <LookDraftContext.Provider value={{ draft, pick }}>
      <div className="flex items-center justify-between">
        <BackLink
          href="/profile"
          onClick={(event) => {
            if (dirty && !window.confirm(DISCARD)) event.preventDefault();
          }}
        />
        <button
          type="button"
          onClick={done}
          disabled={saving}
          className={cn(
            "cursor-pointer rounded-full px-3 py-1.5 text-base font-bold text-accent transition-opacity hover:opacity-80",
            saving && "cursor-wait opacity-60",
          )}
        >
          {saving ? "Saving…" : "Done"}
        </button>
      </div>
      {error && (
        <p
          role="alert"
          className="rounded-[var(--radius-control)] border border-border bg-elevated px-3 py-2 text-sm font-semibold text-text-primary"
        >
          {error}
        </p>
      )}
      {children}
    </LookDraftContext.Provider>
  );
}
