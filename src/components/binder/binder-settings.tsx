"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { BinderCover } from "@/components/binder/binder-cover";
import { saveBinderSettingsAction } from "@/lib/binder/actions";
import type { BinderSettingsPatch } from "@/lib/binder/binder";
import {
  BINDER_COVERS,
  BINDER_LAYOUTS,
  type BinderCoverId,
  type BinderLayout,
} from "@/lib/binder/covers";
import { cn } from "@/lib/cn";

/* Said with the multiplication sign, the way a binder is sold. */
const LAYOUT_LABEL: Record<BinderLayout, string> = { 2: "2 × 2", 3: "3 × 3" };

/**
 * The binder's settings strip, under the page, for its owner.
 *
 * Public or not, two by two or three by three, and the cover. Every
 * change saves at once and paints at once: the parent holds the live
 * values and repaints the page from them, the action lands behind,
 * and the refresh confirms it. Nothing here has a Save button because
 * nothing here is worth a second tap.
 */
export function BinderSettings({
  isPublic,
  layout,
  cover,
  onChange,
}: {
  isPublic: boolean;
  layout: BinderLayout;
  cover: BinderCoverId;
  /** Paint the page with the new value, before the server answers. */
  onChange: (patch: BinderSettingsPatch) => void;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const save = (patch: BinderSettingsPatch) => {
    setError(null);
    onChange(patch);
    start(async () => {
      const result = await saveBinderSettingsAction(patch);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      router.refresh();
    });
  };

  return (
    <section className="flex flex-col gap-4 rounded-[var(--radius-control)] border border-border bg-elevated/40 p-4">
      <p className="font-semibold text-text-primary">Binder</p>

      <label className="flex cursor-pointer items-center justify-between gap-3 rounded-[var(--radius-control)] border border-border bg-elevated p-3">
        <span className="flex min-w-0 flex-col">
          <span className="text-sm font-semibold text-text-primary">Public</span>
          <span className="text-xs text-text-muted">
            {isPublic ? "Anyone on cardflare can open it" : "Only you"}
          </span>
        </span>
        <input
          type="checkbox"
          role="switch"
          checked={isPublic}
          aria-checked={isPublic}
          disabled={pending}
          onChange={(event) => save({ isPublic: event.target.checked })}
          className="size-5 shrink-0 cursor-pointer rounded-[6px] border border-border-strong bg-canvas accent-accent"
        />
      </label>

      <div className="flex flex-col gap-2">
        <p className="text-sm font-semibold text-text-primary">Layout</p>
        <div className="flex gap-2" role="radiogroup" aria-label="Layout">
          {BINDER_LAYOUTS.map((option) => {
            const on = option === layout;
            return (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={on}
                disabled={pending}
                onClick={() => {
                  if (!on) save({ layout: option });
                }}
                className={cn(
                  "cursor-pointer rounded-full border px-4 py-1.5 text-xs transition-colors",
                  on
                    ? "border-accent bg-accent font-bold text-accent-contrast"
                    : "border-border bg-surface font-semibold text-text-secondary hover:border-border-strong hover:text-text-primary",
                )}
              >
                {LAYOUT_LABEL[option]}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-sm font-semibold text-text-primary">Cover</p>
        <div className="flex flex-wrap gap-3" role="radiogroup" aria-label="Cover">
          {BINDER_COVERS.map((option) => {
            const on = option.id === cover;
            return (
              <button
                key={option.id}
                type="button"
                role="radio"
                aria-checked={on}
                disabled={pending}
                onClick={() => {
                  if (!on) save({ cover: option.id });
                }}
                className="flex w-16 cursor-pointer flex-col items-center gap-1.5"
              >
                <BinderCover
                  cover={option.id}
                  frontImageUrl={null}
                  size="xs"
                  className={cn(
                    on
                      ? "ring-2 ring-accent ring-offset-2 ring-offset-canvas"
                      : "ring-1 ring-border",
                  )}
                />
                <span
                  className={cn(
                    "text-[11px]",
                    on ? "font-bold text-text-primary" : "text-text-secondary",
                  )}
                >
                  {option.name}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </section>
  );
}
