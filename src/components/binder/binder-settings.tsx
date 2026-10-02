"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";

import { BinderCover } from "@/components/binder/binder-cover";
import { BINDER_NAME_MAX } from "@/components/binder/create-binder";
import { Button } from "@/components/ui/button";
import { TextInput } from "@/components/ui/controls";
import { Sheet } from "@/components/ui/sheet";
import { deleteBinderAction, saveBinderSettingsAction } from "@/lib/binder/actions";
import type { BinderKind, BinderSettingsPatch } from "@/lib/binder/binder";
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
 * Private or not, two by two or three by three, and the cover. Every
 * change saves at once and paints at once: the parent holds the live
 * values and repaints the page from them, the action lands behind,
 * and the refresh confirms it. Nothing here has a Save button because
 * nothing here is worth a second tap.
 *
 * The switch says "Private" and on means private. The founder, on the
 * first version: "the toggle for public is kinda weird. should be a
 * toggle for 'private' if anything. so if the toggle is on, it is a
 * private binder." The server still stores `isPublic`, so the switch
 * writes its opposite.
 *
 * A custom binder is named, so its strip starts with a Name field
 * (saved when the field is left, or on Enter) and ends with Delete
 * binder, behind a confirm that says how many cards go with it. The
 * Trade binder has neither: there is one, it is called the Trade
 * binder, and it stays.
 */
export function BinderSettings({
  binderId,
  kind,
  name,
  count,
  isPublic,
  layout,
  cover,
  onChange,
}: {
  /** "trade", or a custom binder's uuid. */
  binderId: string;
  kind: BinderKind;
  /** The custom binder's name, as the page holds it. */
  name: string;
  /** How many cards would leave with it. */
  count: number;
  isPublic: boolean;
  layout: BinderLayout;
  cover: BinderCoverId;
  /** Paint the page with the new value, before the server answers. */
  onChange: (patch: BinderSettingsPatch) => void;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [draftName, setDraftName] = useState(name);
  const [confirming, setConfirming] = useState(false);
  const custom = kind === "custom";

  const save = (patch: BinderSettingsPatch) => {
    setError(null);
    onChange(patch);
    start(async () => {
      const result = await saveBinderSettingsAction(patch, binderId);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      router.refresh();
    });
  };

  /* The name goes when the field is left or Enter is pressed, and only
     when it changed; an empty one falls back to what it was. */
  const commitName = () => {
    const trimmed = draftName.trim().slice(0, BINDER_NAME_MAX);
    if (trimmed.length === 0) {
      setDraftName(name);
      return;
    }
    if (trimmed === name) return;
    setDraftName(trimmed);
    save({ name: trimmed });
  };

  const remove = () => {
    if (pending) return;
    setError(null);
    start(async () => {
      const result = await deleteBinderAction(binderId);
      if (!result.ok) {
        setError(result.message);
        setConfirming(false);
        return;
      }
      router.push("/profile?tab=binders");
      router.refresh();
    });
  };

  return (
    <section className="flex flex-col gap-4 rounded-[var(--radius-control)] border border-border bg-elevated/40 p-4">
      <p className="font-semibold text-text-primary">Binder</p>

      {custom && (
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold text-text-primary">Name</span>
          <TextInput
            value={draftName}
            onChange={(event) =>
              setDraftName(event.target.value.slice(0, BINDER_NAME_MAX))
            }
            onBlur={commitName}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                commitName();
              }
            }}
            maxLength={BINDER_NAME_MAX}
            disabled={pending}
            aria-label="Binder name"
          />
        </label>
      )}

      <label className="flex cursor-pointer items-center justify-between gap-3 rounded-[var(--radius-control)] border border-border bg-elevated p-3">
        <span className="flex min-w-0 flex-col">
          <span className="text-sm font-semibold text-text-primary">Private</span>
          <span className="text-xs text-text-muted">
            {isPublic ? "Anyone on cardflare can open it" : "Only you can open it"}
          </span>
        </span>
        <input
          type="checkbox"
          role="switch"
          checked={!isPublic}
          aria-checked={!isPublic}
          disabled={pending}
          onChange={(event) => save({ isPublic: !event.target.checked })}
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
                  plain
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

      {custom && (
        <>
          <Button
            type="button"
            variant="danger"
            size="sm"
            className="w-fit"
            disabled={pending}
            onClick={() => setConfirming(true)}
          >
            <Trash2 className="size-4" aria-hidden="true" />
            Delete binder
          </Button>

          <Sheet
            open={confirming}
            onClose={() => setConfirming(false)}
            title="Delete binder"
            footer={
              <div className="flex items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={pending}
                  onClick={() => setConfirming(false)}
                >
                  Keep
                </Button>
                <Button
                  type="button"
                  variant="danger"
                  size="sm"
                  disabled={pending}
                  onClick={remove}
                >
                  Delete
                </Button>
              </div>
            }
          >
            <p className="text-sm text-text-primary">
              Delete {name}? Its {count} {count === 1 ? "card leaves" : "cards leave"}{" "}
              with it.
            </p>
          </Sheet>
        </>
      )}
    </section>
  );
}
