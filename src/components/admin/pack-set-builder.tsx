"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import Image from "next/image";
import { Check, ChevronDown, Loader2, PackagePlus, Trash2 } from "lucide-react";

import { Badge, Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, TextInput, Textarea } from "@/components/ui/controls";
import {
  createPackSetAction,
  deletePackSetAction,
  putPackSetItemAction,
  removePackSetItemAction,
  setPackSetStatusAction,
  updatePackSetAction,
} from "@/lib/admin/catalog-actions";
import {
  CATALOG_IDLE,
  slugFromName,
  type CatalogState,
} from "@/lib/admin/catalog-schema";
import type { PackSet } from "@/lib/admin/pack-sets";

/**
 * Building a set: what it is called, when it opens, what it looks like
 * and what is inside with what chance.
 *
 * The weights readout is the important part of this screen. Odds are a
 * promise printed in the store, so a set whose weights do not total
 * exactly 100 is a lie waiting to ship - the total is shown live as
 * items are added, and publishing is refused until it lands on 100.
 */

const RARITIES = ["common", "uncommon", "rare", "epic", "legendary"] as const;

export function PackSetBuilder({
  sets,
  choices,
}: {
  sets: PackSet[];
  /** Every cosmetic that can go in a set, with a public art URL if set. */
  choices: { slug: string; name: string; kind: string; status: string }[];
}) {
  const [state, create] = useActionState<CatalogState, FormData>(
    createPackSetAction,
    CATALOG_IDLE,
  );
  const [name, setName] = useState("");

  const nextSetNumber = (sets[0]?.setNumber ?? 0) + 1;

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="flex items-center gap-2 font-semibold text-text-primary">
            <PackagePlus className="size-4 text-accent" aria-hidden="true" />
            New set
          </h2>
          <p className="text-sm text-text-secondary">
            Created as a draft. Nothing shows in the Embers store until you publish it,
            and not before its release date even then.
          </p>
        </div>

        <form action={create} className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            <TextInput
              name="name"
              required
              maxLength={60}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Set name, e.g. Embers"
              aria-label="Set name"
              className="min-w-0 flex-1 basis-48"
            />
            <TextInput
              name="setNumber"
              type="number"
              min={1}
              max={999}
              required
              defaultValue={nextSetNumber}
              aria-label="Set number"
              className="w-24"
            />
          </div>

          {/* The slug is derived, never typed: it is what pack rows point
              at forever, and a typo becomes permanent. */}
          <input type="hidden" name="slug" value={slugFromName(name)} />

          <Textarea
            name="description"
            maxLength={300}
            rows={2}
            placeholder="One line about the set (optional)"
            aria-label="Set description"
          />

          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1 text-xs text-text-muted">
              Price in Embers
              <TextInput
                name="priceEmbers"
                type="number"
                min={0}
                defaultValue={300}
                className="w-28"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-text-muted">
              Cosmetics per pack
              <TextInput
                name="slots"
                type="number"
                min={1}
                max={10}
                defaultValue={3}
                className="w-28"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-text-muted">
              Release date and time
              <TextInput name="releaseAt" type="datetime-local" className="w-56" />
            </label>
            <Submit label="Create set" pendingLabel="Creating…" />
          </div>

          {state.status !== "idle" && (
            <p
              role="status"
              className={`flex items-center gap-1.5 text-sm ${
                state.status === "error" ? "text-danger" : "text-text-secondary"
              }`}
            >
              {state.status === "done" && (
                <Check className="size-3.5 text-accent" aria-hidden="true" />
              )}
              {state.message}
            </p>
          )}
        </form>
      </Card>

      {sets.map((set) => (
        <PackSetRow key={set.slug} set={set} choices={choices} />
      ))}
    </div>
  );
}

function PackSetRow({
  set,
  choices,
}: {
  set: PackSet;
  choices: { slug: string; name: string; kind: string; status: string }[];
}) {
  const [open, setOpen] = useState(false);

  const [editState, edit] = useActionState<CatalogState, FormData>(
    updatePackSetAction,
    CATALOG_IDLE,
  );
  const [itemState, putItem] = useActionState<CatalogState, FormData>(
    putPackSetItemAction,
    CATALOG_IDLE,
  );
  const [dropState, dropItem] = useActionState<CatalogState, FormData>(
    removePackSetItemAction,
    CATALOG_IDLE,
  );
  const [publishState, publish] = useActionState<CatalogState, FormData>(
    setPackSetStatusAction,
    CATALOG_IDLE,
  );
  const [killState, kill] = useActionState<CatalogState, FormData>(
    deletePackSetAction,
    CATALOG_IDLE,
  );

  const said =
    [editState, itemState, dropState, publishState, killState].find(
      (candidate) => candidate.status !== "idle",
    ) ?? CATALOG_IDLE;

  const balanced = Math.abs(set.weightTotal - 100) < 0.001;

  /* A datetime-local input wants "YYYY-MM-DDTHH:mm" in local time. */
  const releaseValue = set.releaseAt
    ? new Date(
        new Date(set.releaseAt).getTime() - new Date().getTimezoneOffset() * 60000,
      )
        .toISOString()
        .slice(0, 16)
    : "";

  return (
    <Card className="flex flex-col gap-3">
      <button
        type="button"
        onClick={() => setOpen((was) => !was)}
        aria-expanded={open}
        className="flex flex-wrap items-center gap-x-3 gap-y-2 text-left"
      >
        <span className="flex min-w-0 flex-1 basis-48 flex-col">
          <span className="font-semibold text-text-primary">
            {set.name} · Set {set.setNumber}
          </span>
          <span className="truncate text-xs text-text-muted">
            {set.items.length} {set.items.length === 1 ? "item" : "items"} · {set.slots}{" "}
            per pack · {set.priceEmbers} Embers
            {set.releaseAt
              ? ` · opens ${new Date(set.releaseAt).toLocaleString()}`
              : " · no release date"}
          </span>
        </span>

        {set.status === "live" ? (
          <Badge>live</Badge>
        ) : (
          <Badge tone="neutral">draft</Badge>
        )}

        <span
          className={`text-xs tabular-nums ${balanced ? "text-success" : "text-danger"}`}
        >
          {set.weightTotal.toFixed(1)}% of 100
        </span>

        <ChevronDown
          aria-hidden="true"
          className={`size-4 shrink-0 text-text-muted transition-transform duration-300 ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {open && (
        <div className="flex flex-col gap-4 rounded-[var(--radius-control)] border border-border bg-elevated p-4">
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

          <div className="flex flex-wrap items-start gap-4">
            <PackArtPanel slug={set.slug} artUrl={set.artUrl ?? null} />

            <form action={edit} className="flex min-w-0 flex-1 basis-64 flex-col gap-2">
              <input type="hidden" name="seriesSlug" value={set.slug} />
              <TextInput
                name="name"
                defaultValue={set.name}
                maxLength={60}
                aria-label="Set name"
              />
              <Textarea
                name="description"
                defaultValue={set.description}
                maxLength={300}
                rows={2}
                aria-label="Set description"
              />
              <div className="flex flex-wrap items-end gap-2">
                <label className="flex flex-col gap-1 text-xs text-text-muted">
                  Embers
                  <TextInput
                    name="priceEmbers"
                    type="number"
                    min={0}
                    defaultValue={set.priceEmbers}
                    className="w-24"
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs text-text-muted">
                  Per pack
                  <TextInput
                    name="slots"
                    type="number"
                    min={1}
                    max={10}
                    defaultValue={set.slots}
                    className="w-24"
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs text-text-muted">
                  Release
                  <TextInput
                    name="releaseAt"
                    type="datetime-local"
                    defaultValue={releaseValue}
                    className="w-56"
                  />
                </label>
                <Submit label="Save" pendingLabel="Saving…" />
              </div>
            </form>
          </div>

          <div className="flex flex-col gap-2">
            <p className="text-sm font-semibold text-text-primary">What is inside</p>

            {set.items.length === 0 && (
              <p className="text-sm text-text-muted">
                Nothing yet. Add cosmetics below and give each one its chance.
              </p>
            )}

            <ul className="flex flex-col">
              {set.items.map((item) => (
                <li
                  key={item.cosmeticSlug}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border py-2 first:border-t-0"
                >
                  <span className="min-w-0 flex-1 basis-40 truncate text-sm text-text-primary">
                    {item.name}
                  </span>
                  <span className="text-xs text-text-muted capitalize">
                    {item.rarity}
                  </span>
                  <span className="text-xs text-text-secondary tabular-nums">
                    {item.weight}%
                  </span>
                  {item.status === "draft" && (
                    <Badge tone="neutral">still behind the scenes</Badge>
                  )}
                  <form action={dropItem}>
                    <input type="hidden" name="seriesSlug" value={set.slug} />
                    <input
                      type="hidden"
                      name="cosmeticSlug"
                      value={item.cosmeticSlug}
                    />
                    <IconSubmit label={`Take ${item.name} out of the set`} />
                  </form>
                </li>
              ))}
            </ul>

            <form action={putItem} className="flex flex-wrap items-end gap-2 pt-2">
              <input type="hidden" name="seriesSlug" value={set.slug} />
              <label className="flex min-w-0 flex-1 basis-56 flex-col gap-1 text-xs text-text-muted">
                Cosmetic
                <Select name="cosmeticSlug" defaultValue="">
                  <option value="" disabled>
                    Pick one
                  </option>
                  {choices.map((choice) => (
                    <option key={choice.slug} value={choice.slug}>
                      {choice.name} ({choice.kind}
                      {choice.status === "draft" ? ", hidden" : ""})
                    </option>
                  ))}
                </Select>
              </label>
              <label className="flex flex-col gap-1 text-xs text-text-muted">
                Rarity
                <Select name="rarity" defaultValue="common">
                  {RARITIES.map((rarity) => (
                    <option key={rarity} value={rarity}>
                      {rarity}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="flex flex-col gap-1 text-xs text-text-muted">
                Chance %
                <TextInput
                  name="weight"
                  type="number"
                  step="0.1"
                  min="0.1"
                  max="100"
                  defaultValue="10"
                  className="w-24"
                />
              </label>
              <Submit label="Add" pendingLabel="Adding…" />
            </form>
          </div>

          <div className="flex flex-wrap items-center gap-3 border-t border-border pt-3">
            <form action={publish}>
              <input type="hidden" name="seriesSlug" value={set.slug} />
              <input
                type="hidden"
                name="status"
                value={set.status === "live" ? "draft" : "live"}
              />
              <Submit
                label={set.status === "live" ? "Take off sale" : "Publish this set"}
                pendingLabel="Working…"
              />
            </form>

            <form action={kill}>
              <input type="hidden" name="seriesSlug" value={set.slug} />
              <IconSubmit label={`Delete the ${set.name} set`} withWord />
            </form>

            <p className="min-w-0 flex-1 basis-48 text-xs text-text-muted">
              Deleting a set leaves every cosmetic in it exactly where it was.
            </p>
          </div>
        </div>
      )}
    </Card>
  );
}

/** The wrapper art, and the upload that replaces it. */
function PackArtPanel({ slug, artUrl }: { slug: string; artUrl: string | null }) {
  return (
    <div className="flex shrink-0 flex-col gap-2">
      {artUrl ? (
        <Image
          src={artUrl}
          alt=""
          width={120}
          height={176}
          className="h-44 w-30 rounded-[var(--radius-control)] border border-border object-cover"
        />
      ) : (
        <div className="flex h-44 w-30 items-center justify-center rounded-[var(--radius-control)] border border-dashed border-border p-2 text-center text-xs text-text-muted">
          Default CardFlare wrapper
        </div>
      )}

      {/* A plain multipart POST rather than a Server Action: the file
          rides as a real upload body, which is what the route expects. */}
      <form
        action={`/api/admin/pack-art?series=${encodeURIComponent(slug)}`}
        method="post"
        encType="multipart/form-data"
        className="flex flex-col gap-1"
      >
        <input
          type="file"
          name="art"
          accept="image/png,image/jpeg,image/webp"
          required
          aria-label="Pack art image"
          className="w-32 text-xs text-text-muted file:mr-2 file:rounded file:border-0 file:bg-elevated file:px-2 file:py-1 file:text-xs file:text-text-primary"
        />
        <Submit label="Upload art" pendingLabel="Uploading…" />
      </form>
    </div>
  );
}

function Submit({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending && <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />}
      {pending ? pendingLabel : label}
    </Button>
  );
}

function IconSubmit({
  label,
  withWord = false,
}: {
  label: string;
  withWord?: boolean;
}) {
  const { pending } = useFormStatus();

  return (
    <Button
      type="submit"
      variant="ghost"
      size="sm"
      disabled={pending}
      aria-label={label}
    >
      {pending ? (
        <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
      ) : (
        <Trash2 className="size-3.5" aria-hidden="true" />
      )}
      {withWord ? (pending ? "Deleting…" : "Delete set") : null}
    </Button>
  );
}
