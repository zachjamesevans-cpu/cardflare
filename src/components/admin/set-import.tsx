"use client";

import { useState, useTransition } from "react";
import { Check, Loader2, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Select, Textarea } from "@/components/ui/controls";
import { finishImportAction, uploadCardArtAction } from "@/lib/admin/import-actions";
import { CARD_ART_MIME_TYPES } from "@/lib/cards/art-storage";
import {
  IMPORT_IDLE,
  IMPORT_PROVIDER_LABELS,
  IMPORT_PROVIDERS,
  importExternalId,
  importManifestSchema,
  type ImportManifest,
  type ImportState,
} from "@/lib/cards/import-schema";

/**
 * Dropping a whole set in: a manifest and the folder of pictures it names.
 *
 * The pictures go up ONE REQUEST EACH, driven from here rather than
 * posted together. The first cut sent the lot in a single form and the
 * founder's real import — two hundred cards, some forty megabytes — took
 * the page down with no message: a Server Action request is capped at
 * 1MB by default, and Vercel refuses a body over 4.5MB whatever Next is
 * configured to allow. That is a shape to change, not a limit to raise.
 *
 * Doing it here also buys a progress count, which matters when the thing
 * being waited on takes minutes; and it makes the import resumable,
 * because the rows are written at the end from whatever reached the
 * bucket rather than from anything held in this page.
 */
export function SetImport() {
  const [state, setState] = useState<ImportState>(IMPORT_IDLE);
  const [pending, startTransition] = useTransition();

  /* Held in state so the manifest FILE can fill it in. A collected set
     is twenty thousand characters of JSON, and asking somebody to select
     and paste that is a step that goes wrong. */
  const [manifestText, setManifestText] = useState("");
  const [manifest, setManifest] = useState<ImportManifest | null>(null);
  const [manifestError, setManifestError] = useState<string | null>(null);

  const [images, setImages] = useState<Map<string, File>>(new Map());
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(
    null,
  );

  function readManifest(raw: string) {
    setManifestText(raw);
    setManifestError(null);
    setState(IMPORT_IDLE);

    try {
      const parsed = importManifestSchema.safeParse(JSON.parse(raw));
      if (parsed.success) {
        setManifest(parsed.data);
      } else {
        setManifest(null);
        const issue = parsed.error.issues[0];
        setManifestError(
          issue ? `${issue.path.join(".") || "manifest"}: ${issue.message}` : null,
        );
      }
    } catch {
      setManifest(null);
      setManifestError("That file is not valid JSON.");
    }
  }

  /**
   * Takes a whole folder and keeps only what the manifest asked for.
   *
   * Picking a folder rather than selecting two hundred files by hand was
   * the founder's ask, and it drags in everything else that lives there
   * — .DS_Store, the manifest itself, a stray screenshot. Filtered by
   * name against the manifest, so the extras are simply never looked at.
   */
  function chooseImages(files: FileList | null) {
    const wanted = new Set(manifest?.cards.map((card) => card.file) ?? []);
    const kept = new Map<string, File>();

    for (const file of files ?? []) {
      if (wanted.size > 0 && !wanted.has(file.name)) continue;
      if (!(CARD_ART_MIME_TYPES as readonly string[]).includes(file.type)) continue;
      kept.set(file.name, file);
    }

    setImages(kept);
    setState(IMPORT_IDLE);
  }

  async function run() {
    if (!manifest) return;

    setState(IMPORT_IDLE);
    const total = manifest.cards.length;
    setProgress({ done: 0, total });

    /*
     * Sequential, not parallel. Two hundred requests at once would be
     * rude to our own server and would make a failure impossible to
     * attribute, and the point of this loop is that each request is
     * small — which parallelism does not change.
     */
    for (const [index, card] of manifest.cards.entries()) {
      setProgress({ done: index, total });

      const file = images.get(card.file);
      if (!file) continue;

      const body = new FormData();
      body.set("provider", manifest.provider);
      body.set("setCode", manifest.setCode);
      body.set("externalId", importExternalId(card));
      body.set("image", file);

      await uploadCardArtAction(body).catch(() => undefined);
    }

    setProgress({ done: total, total });

    /* The rows, once, from whatever actually reached the bucket. */
    const body = new FormData();
    body.set("manifest", JSON.stringify(manifest));

    setState(await finishImportAction(IMPORT_IDLE, body));
    setProgress(null);
  }

  const shortfall =
    manifest && images.size > 0 && images.size < manifest.cards.length
      ? manifest.cards.length - images.size
      : 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="import-provider"
          className="text-sm font-medium text-text-secondary"
        >
          Where it came from
        </label>
        <Select id="import-provider" value={manifest?.provider ?? "kaizoku"} disabled>
          {IMPORT_PROVIDERS.map((provider) => (
            <option key={provider} value={provider}>
              {IMPORT_PROVIDER_LABELS[provider]}
            </option>
          ))}
        </Select>
        {/* Read from the manifest rather than chosen here, so the file
            and the console cannot disagree about what is being imported. */}
        <p className="text-xs text-text-muted">
          Taken from the manifest. Stored on every row, so the whole import can be
          removed in one click.
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="import-manifest"
          className="text-sm font-medium text-text-secondary"
        >
          Manifest
        </label>
        <input
          type="file"
          accept="application/json,.json"
          aria-label="Choose manifest.json"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void file.text().then(readManifest);
          }}
          className="text-sm text-text-secondary file:mr-3 file:rounded-[var(--radius-control)] file:border-0 file:bg-elevated file:px-3 file:py-2 file:text-sm file:font-semibold file:text-text-primary"
        />
        <p className="text-xs text-text-muted">
          Choose the <code className="font-mono">manifest.json</code> the collector
          wrote, or paste it below.
        </p>
        <Textarea
          id="import-manifest"
          rows={6}
          spellCheck={false}
          value={manifestText}
          onChange={(event) => readManifest(event.target.value)}
          className="font-mono text-xs"
          placeholder={`{\n  "provider": "kaizoku",\n  "setCode": "OP17",\n  "setName": "…",\n  "cards": [\n    { "cardNumber": "OP17-001", "name": "…", "file": "OP17-001.png" }\n  ]\n}`}
        />
        {manifestError && <p className="text-xs text-danger">{manifestError}</p>}
        {manifest && (
          <p className="text-xs text-text-muted">
            {manifest.setCode} · {manifest.setName} · {manifest.cards.length} card
            {manifest.cards.length === 1 ? "" : "s"}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="import-images"
          className="text-sm font-medium text-text-secondary"
        >
          The folder of pictures
        </label>
        <input
          id="import-images"
          type="file"
          multiple
          /*
           * Non-standard, and every browser that matters supports it.
           * React does not know the attribute, hence the cast — without
           * it this is a picker that makes somebody select two hundred
           * files by hand, which was the founder's complaint.
           */
          {...({ webkitdirectory: "", directory: "" } as Record<string, string>)}
          onChange={(event) => chooseImages(event.target.files)}
          className="text-sm text-text-secondary file:mr-3 file:rounded-[var(--radius-control)] file:border-0 file:bg-elevated file:px-3 file:py-2 file:text-sm file:font-semibold file:text-text-primary"
        />
        <p className={`text-xs ${shortfall > 0 ? "text-danger" : "text-text-muted"}`}>
          {images.size === 0
            ? "Pick the images folder itself, not the files inside it."
            : shortfall > 0
              ? `${images.size} matched, ${shortfall} still missing. Is this the right folder?`
              : `${images.size} picture${images.size === 1 ? "" : "s"} matched the manifest.`}
        </p>
      </div>

      <Button
        type="button"
        disabled={!manifest || pending}
        onClick={() => startTransition(run)}
        className="w-fit"
      >
        {pending ? (
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        ) : (
          <Upload className="size-4" aria-hidden="true" />
        )}
        {pending ? "Importing…" : "Import the set"}
      </Button>

      {progress && (
        /* Said out loud because this takes minutes, and a page that looks
           frozen is a page somebody reloads half way through. */
        <div className="flex flex-col gap-1.5">
          <p role="status" className="text-sm text-text-secondary tabular-nums">
            Uploading {progress.done} of {progress.total}…
          </p>
          <div className="h-1.5 overflow-hidden rounded-full bg-elevated">
            <div
              className="h-full bg-accent transition-[width] duration-[var(--duration-base)]"
              style={{
                width: `${Math.round((progress.done / progress.total) * 100)}%`,
              }}
            />
          </div>
          <p className="text-xs text-text-muted">
            Leave this page open. Closing it stops the upload, but nothing is lost —
            running it again picks up where it left off.
          </p>
        </div>
      )}

      {state.status === "error" && (
        <p role="status" className="text-sm text-danger">
          {state.message}
        </p>
      )}

      {state.status === "done" && (
        <div className="flex flex-col gap-1.5">
          <p role="status" className="flex items-center gap-1.5 text-sm text-success">
            <Check className="size-3.5" aria-hidden="true" />
            {state.message}
          </p>
          <p className="text-xs text-text-muted tabular-nums">
            {state.cards} card{state.cards === 1 ? "" : "s"} · {state.printings}{" "}
            printing{state.printings === 1 ? "" : "s"} · {state.images} with art
          </p>
          {state.missing.length > 0 && (
            /* Named, not counted. A number says something went wrong;
               the numbers say which ones to go back for. */
            <p className="text-xs text-danger">
              No art for: {state.missing.slice(0, 20).join(", ")}
              {state.missing.length > 20
                ? ` and ${state.missing.length - 20} more`
                : ""}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
