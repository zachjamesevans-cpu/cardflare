"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";

import { BinderCover } from "@/components/binder/binder-cover";
import { BINDER_NAME_MAX } from "@/components/binder/create-binder";
import { ForTradeSwitch } from "@/components/binder/for-trade-switch";
import { Button } from "@/components/ui/button";
import { TextInput } from "@/components/ui/controls";
import { Sheet } from "@/components/ui/sheet";
import { deleteBinderAction, saveBinderSettingsAction } from "@/lib/binder/actions";
import type { BinderSettingsPatch } from "@/lib/binder/binder";
import { BINDER_COVERS, type BinderCoverId } from "@/lib/binder/covers";
import { cn } from "@/lib/cn";

/**
 * The binder's settings strip, under the page, for its owner.
 *
 * The name, whether it is up for trade, and the cover; then Delete
 * binder. Every change saves at once and paints at once: the parent
 * holds the live values and repaints the page from them, the action
 * lands behind, and the refresh confirms it. Nothing here has a Save
 * button because nothing here is worth a second tap.
 *
 * The name is the binder's own, saved when the field is left or on
 * Return. The founder: "Ability to change name of binder. Notice how
 * it says 'yours' in bottom left of binder? Allow us to change that
 * text." The one switch is Up for trade, and on means open: public
 * to every signed-in player, its cards available. "Anything that's
 * public is up for trade." Every binder can be deleted, behind a
 * confirm that says how many cards go with it; deleting the last one
 * leaves the profile with the "+" alone.
 */
export function BinderSettings({
  binderId,
  name,
  count,
  forTrade,
  cover,
  onChange,
}: {
  binderId: string;
  /** The binder's name, as the page holds it. */
  name: string;
  /** How many cards would leave with it. */
  count: number;
  forTrade: boolean;
  cover: BinderCoverId;
  /** Paint the page with the new value, before the server answers. */
  onChange: (patch: BinderSettingsPatch) => void;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [draftName, setDraftName] = useState(name);
  const [confirming, setConfirming] = useState(false);

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

  /* The name goes when the field is left or Return is pressed, and
     only when it changed; an empty one falls back to what it was. */
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

      <ForTradeSwitch
        on={forTrade}
        disabled={pending}
        onChange={(on) => save({ forTrade: on })}
      />

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
          Delete {name}? Its {count} {count === 1 ? "card leaves" : "cards leave"} with
          it.
        </p>
      </Sheet>
    </section>
  );
}
