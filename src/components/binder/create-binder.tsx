"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";

import { BinderCover } from "@/components/binder/binder-cover";
import { ForTradeSwitch } from "@/components/binder/for-trade-switch";
import { Button } from "@/components/ui/button";
import { TextInput } from "@/components/ui/controls";
import { Sheet } from "@/components/ui/sheet";
import { createBinderAction } from "@/lib/binder/actions";
import {
  BINDER_COVERS,
  DEFAULT_BINDER_COVER,
  type BinderCoverId,
} from "@/lib/binder/covers";
import { cn } from "@/lib/cn";

/**
 * Starting a binder: a name, one of the seven covers, whether it is
 * up for trade, Create.
 *
 * A binder is whatever the owner names it ("Grails", "Playables",
 * "One Piece"). The one switch, Up for trade, is off to start: on,
 * the binder is open to every signed-in player and its cards are the
 * ones nearby hunters hear about; off, only the owner opens it. The
 * founder: "Anything that's public is up for trade." The dialog is
 * the same whichever door opens it: the dashed "+" at the end of the
 * highlights row on the profile, or the "New binder" button on the
 * Binders tab. The binder opens as soon as it exists. The app's
 * create-binder-sheet.tsx asks the same three things with the same
 * words.
 */

/**
 * As long as a name may be: the client's copy of the server's
 * BINDER_NAME_MAX, which lives in a server-only module. The parity
 * test holds the two to the same number.
 */
export const BINDER_NAME_MAX = 40;

export function CreateBinder({ trigger }: { trigger: "tile" | "button" }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [cover, setCover] = useState<BinderCoverId>(DEFAULT_BINDER_COVER);
  const [forTrade, setForTrade] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const close = () => {
    if (pending) return;
    setOpen(false);
    setName("");
    setCover(DEFAULT_BINDER_COVER);
    setForTrade(false);
    setError(null);
  };

  const create = () => {
    if (pending) return;
    const trimmed = name.trim();
    if (trimmed.length === 0) {
      setError("Give the binder a name.");
      return;
    }
    setError(null);
    start(async () => {
      const result = await createBinderAction({ name: trimmed, cover, forTrade });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setOpen(false);
      router.push(`/profile/binders/${result.id}`);
    });
  };

  return (
    <>
      {trigger === "tile" ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex w-full cursor-pointer flex-col items-center gap-1.5 rounded-[var(--radius-control)] text-text-secondary hover:text-text-primary focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
        >
          <span className="flex size-16 items-center justify-center rounded-full border border-dashed border-border-strong">
            <Plus className="size-6" aria-hidden="true" />
          </span>
          <span className="text-[11px] leading-none">New</span>
        </button>
      ) : (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => setOpen(true)}
        >
          <Plus className="size-4" aria-hidden="true" />
          New binder
        </Button>
      )}

      <Sheet
        open={open}
        onClose={close}
        title="New binder"
        footer={
          <div className="flex flex-col gap-2">
            {error && (
              <p role="alert" className="text-sm text-danger">
                {error}
              </p>
            )}
            <Button type="button" onClick={create} disabled={pending}>
              {pending ? "Creating…" : "Create"}
            </Button>
          </div>
        }
      >
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            create();
          }}
        >
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-text-secondary">Name</span>
            <TextInput
              value={name}
              onChange={(event) =>
                setName(event.target.value.slice(0, BINDER_NAME_MAX))
              }
              maxLength={BINDER_NAME_MAX}
              placeholder='Name it, like "Grails" or "Playables"'
              autoFocus
              required
            />
          </label>

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
                    onClick={() => setCover(option.id)}
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

          <ForTradeSwitch on={forTrade} disabled={pending} onChange={setForTrade} />
        </form>
      </Sheet>
    </>
  );
}
