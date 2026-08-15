"use client";

import { useActionState, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { Check, ChevronDown, Loader2, Trash2 } from "lucide-react";

import { CosmeticArt } from "@/components/players/cosmetic-art";
import { CosmeticCard } from "@/components/players/cosmetic-card";
import { PlayerAvatar } from "@/components/players/player-avatar";
import { Badge, Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TextInput } from "@/components/ui/controls";
import {
  deleteCosmeticAction,
  setCosmeticStatusAction,
} from "@/lib/admin/catalog-actions";
import { CATALOG_IDLE, type CatalogState } from "@/lib/admin/catalog-schema";
import type { CatalogEntry } from "@/lib/admin/catalog";

/**
 * The whole cosmetics catalogue, live and behind the scenes together.
 *
 * The founder's plan for this screen is to walk it item by item, keep
 * what is good enough for a future set, and throw the rest away. So the
 * three things a row has to answer are: what does it look like, is
 * anybody using it, and can I delete it.
 *
 * On the preview: the nine frames, four holos and four effects that
 * shipped have real art, and are drawn here with the SAME components the
 * profile uses, so this screen is a true preview of them. Everything in
 * the draft catalogue is a name and a description with no art built yet,
 * and that is shown as exactly that rather than as a pretty placeholder
 * pretending to be a cosmetic. A fake preview would be the worst
 * possible input to the decision this screen exists to support.
 */
export function CatalogBrowser({
  entries,
  groups,
}: {
  entries: CatalogEntry[];
  /** Kind to heading and blurb, in display order. */
  groups: { kind: string; title: string; blurb: string }[];
}) {
  const [filter, setFilter] = useState("");
  const [openKind, setOpenKind] = useState<string | null>(null);

  const [statusState, flip] = useActionState<CatalogState, FormData>(
    setCosmeticStatusAction,
    CATALOG_IDLE,
  );
  const [deleteState, remove] = useActionState<CatalogState, FormData>(
    deleteCosmeticAction,
    CATALOG_IDLE,
  );

  const said =
    [statusState, deleteState].find((state) => state.status !== "idle") ?? CATALOG_IDLE;

  const term = filter.trim().toLowerCase();

  const byKind = useMemo(() => {
    const map = new Map<string, CatalogEntry[]>();
    for (const entry of entries) {
      if (
        term &&
        !entry.name.toLowerCase().includes(term) &&
        !entry.slug.includes(term)
      ) {
        continue;
      }
      const list = map.get(entry.kind) ?? [];
      list.push(entry);
      map.set(entry.kind, list);
    }
    return map;
  }, [entries, term]);

  const liveCount = entries.filter((entry) => entry.status === "live").length;

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="font-semibold text-text-primary">Cosmetics catalogue</h2>
          <p className="text-sm text-text-secondary">
            {entries.length} in total · {liveCount} live · {entries.length - liveCount}{" "}
            behind the scenes. Draft cosmetics are invisible to every player.
          </p>
        </div>
        <TextInput
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          placeholder="Search by name"
          aria-label="Search the catalogue"
          className="w-56"
        />
      </div>

      {said.status !== "idle" && (
        <p
          role="status"
          className={`flex items-center gap-1.5 text-sm ${
            said.status === "error" ? "text-danger" : "text-text-secondary"
          }`}
        >
          {said.status === "done" && (
            <Check className="size-3.5 text-accent" aria-hidden="true" />
          )}
          {said.message}
        </p>
      )}

      <ul className="flex flex-col gap-2">
        {groups.map((group) => {
          const items = byKind.get(group.kind) ?? [];
          if (items.length === 0) return null;
          const open = openKind === group.kind || term.length > 0;

          return (
            <li
              key={group.kind}
              className="rounded-[var(--radius-control)] border border-border"
            >
              <button
                type="button"
                onClick={() =>
                  setOpenKind((current) => (current === group.kind ? null : group.kind))
                }
                aria-expanded={open}
                className="flex w-full items-center gap-3 p-3 text-left"
              >
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="font-semibold text-text-primary">{group.title}</span>
                  <span className="truncate text-xs text-text-muted">
                    {group.blurb}
                  </span>
                </span>
                <span className="shrink-0 text-sm text-text-muted tabular-nums">
                  {items.length}
                </span>
                <ChevronDown
                  aria-hidden="true"
                  className={`size-4 shrink-0 text-text-muted transition-transform duration-300 ${
                    open ? "rotate-180" : ""
                  }`}
                />
              </button>

              {open && (
                <ul className="grid grid-cols-[repeat(auto-fill,minmax(170px,1fr))] gap-3 border-t border-border p-3">
                  {items.map((entry) => (
                    <CatalogTile
                      key={entry.slug}
                      entry={entry}
                      onFlip={flip}
                      onDelete={remove}
                    />
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

/** Live cosmetics drawn by the shipped components; drafts by CosmeticArt. */
const SHIPPED = new Set(["frame", "holo", "effect"]);

/**
 * One cosmetic as a tile: art on top, always visible, verdict buttons
 * underneath. The founder's brief for this screen: "have the option to
 * test all of them at once... with the option to fully delete them."
 * A grid of living previews with a Delete on each is exactly that.
 */
function CatalogTile({
  entry,
  onFlip,
  onDelete,
}: {
  entry: CatalogEntry;
  onFlip: (formData: FormData) => void;
  onDelete: (formData: FormData) => void;
}) {
  return (
    <li className="flex flex-col gap-2 rounded-[var(--radius-control)] border border-border bg-elevated p-3">
      <div className="grid min-h-28 place-items-center">
        {SHIPPED.has(entry.kind) ? (
          <div className="flex items-end gap-3">
            <CosmeticCard
              imageUrl={null}
              name={entry.name}
              number="preview"
              imagesEnabled={false}
              frame={entry.kind === "frame" ? entry.slug : null}
              holo={entry.kind === "holo" ? entry.slug : null}
              effect={entry.kind === "effect" ? entry.slug : null}
              className="w-20"
            />
            {entry.kind === "frame" && (
              <PlayerAvatar
                displayName="CHUNC"
                seed={entry.slug}
                avatarUrl={null}
                frame={entry.slug}
                size="md"
              />
            )}
          </div>
        ) : (
          <CosmeticArt kind={entry.kind} slug={entry.slug} className="w-full" />
        )}
      </div>

      <div className="flex flex-col">
        <span className="truncate text-sm font-semibold text-text-primary">
          {entry.name}
        </span>
        <span className="truncate text-xs text-text-muted" title={entry.description}>
          {entry.description}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {entry.status === "draft" ? (
          <Badge tone="neutral">hidden</Badge>
        ) : (
          <Badge>live</Badge>
        )}
        {entry.owners > 0 && (
          <span className="text-xs text-text-muted tabular-nums">
            {entry.owners} {entry.owners === 1 ? "owner" : "owners"}
          </span>
        )}
        {entry.inSets.length > 0 && (
          <span className="truncate text-xs text-text-muted">
            in {entry.inSets.join(", ")}
          </span>
        )}
      </div>

      <div className="mt-auto flex items-center gap-1.5">
        <form action={onFlip}>
          <input type="hidden" name="slug" value={entry.slug} />
          <input
            type="hidden"
            name="status"
            value={entry.status === "live" ? "draft" : "live"}
          />
          <SmallSubmit
            label={entry.status === "live" ? "Hide" : "Set live"}
            pendingLabel="Saving…"
          />
        </form>

        {/* Deleting is refused server-side when anybody owns it; the
            button is not even offered in that case. */}
        {entry.owners === 0 && (
          <form action={onDelete}>
            <input type="hidden" name="slug" value={entry.slug} />
            <DeleteSubmit name={entry.name} />
          </form>
        )}
      </div>
    </li>
  );
}

function SmallSubmit({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" variant="secondary" size="sm" disabled={pending}>
      {pending && <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />}
      {pending ? pendingLabel : label}
    </Button>
  );
}

function DeleteSubmit({ name }: { name: string }) {
  const { pending } = useFormStatus();

  return (
    <Button
      type="submit"
      variant="ghost"
      size="sm"
      disabled={pending}
      aria-label={`Delete ${name} for good`}
    >
      {pending ? (
        <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
      ) : (
        <Trash2 className="size-3.5" aria-hidden="true" />
      )}
      {pending ? "Deleting…" : "Delete"}
    </Button>
  );
}
