"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Check, Loader2, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Select, Textarea } from "@/components/ui/controls";
import { importSetAction } from "@/lib/admin/import-actions";
import {
  IMPORT_IDLE,
  IMPORT_PROVIDER_LABELS,
  IMPORT_PROVIDERS,
  type ImportState,
} from "@/lib/cards/import-schema";

/**
 * Dropping a whole set in: a manifest and the pictures it names.
 *
 * Two inputs rather than one archive, because a folder of images is what
 * a collector actually ends up holding and asking them to zip it is a
 * step that can go wrong on the way. The manifest is pasted rather than
 * uploaded for the same reason the SQL blocks are pasted: it is text,
 * and text in front of you is text you can check.
 *
 * The count of selected files is shown before anything is sent. An
 * import that silently landed with forty missing pictures would look
 * like it worked until somebody opened a board.
 */
export function SetImport() {
  const [state, action] = useActionState<ImportState, FormData>(
    importSetAction,
    IMPORT_IDLE,
  );

  const [chosen, setChosen] = useState(0);

  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="import-provider"
          className="text-sm font-medium text-text-secondary"
        >
          Where it came from
        </label>
        <Select id="import-provider" name="provider" defaultValue="kaizoku">
          {IMPORT_PROVIDERS.map((provider) => (
            <option key={provider} value={provider}>
              {IMPORT_PROVIDER_LABELS[provider]}
            </option>
          ))}
        </Select>
        {/* The reason this field exists at all, said where it is chosen. */}
        <p className="text-xs text-text-muted">
          Stored on every row, so the whole import can be removed in one statement the
          day a real provider ships the set.
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="import-manifest"
          className="text-sm font-medium text-text-secondary"
        >
          Manifest
        </label>
        <Textarea
          id="import-manifest"
          name="manifest"
          required
          rows={10}
          spellCheck={false}
          className="font-mono text-xs"
          placeholder={`{\n  "provider": "kaizoku",\n  "setCode": "OP17",\n  "setName": "…",\n  "cards": [\n    { "cardNumber": "OP17-001", "name": "…", "file": "OP17-001.png" }\n  ]\n}`}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="import-images"
          className="text-sm font-medium text-text-secondary"
        >
          The pictures the manifest names
        </label>
        <input
          id="import-images"
          name="images"
          type="file"
          multiple
          accept="image/png,image/jpeg,image/webp"
          onChange={(event) => setChosen(event.target.files?.length ?? 0)}
          className="text-sm text-text-secondary file:mr-3 file:rounded-[var(--radius-control)] file:border-0 file:bg-elevated file:px-3 file:py-2 file:text-sm file:font-semibold file:text-text-primary"
        />
        <p className="text-xs text-text-muted">
          {chosen === 0
            ? "None selected yet. Cards import without art if you send none."
            : `${chosen} file${chosen === 1 ? "" : "s"} selected.`}
        </p>
      </div>

      <ImportButton />

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
            printing{state.printings === 1 ? "" : "s"} · {state.images} image
            {state.images === 1 ? "" : "s"} stored
          </p>
          {state.skipped.length > 0 && (
            /* Named, not counted. A number tells you something went wrong;
               the numbers tell you which ones to go back for. */
            <p className="text-xs text-danger">
              No art stored for: {state.skipped.join(", ")}
            </p>
          )}
        </div>
      )}
    </form>
  );
}

function ImportButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending} className="w-fit">
      {pending ? (
        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
      ) : (
        <Upload className="size-4" aria-hidden="true" />
      )}
      {pending ? "Importing…" : "Import the set"}
    </Button>
  );
}
