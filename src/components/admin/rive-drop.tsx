import { Upload } from "lucide-react";

import { Card } from "@/components/ui/card";
import { CATALOG_KINDS, KIND_LABELS } from "@/lib/admin/catalog";

/**
 * Dropping a .riv file into the catalogue.
 *
 * The founder's ask, verbatim: "the ability to drop these files into any
 * of the customization categories, and the ability to name them, and
 * choose when they're live, and add them to the pack distribution
 * list... the goal is to be able to drop these files in at will, they
 * just work."
 *
 * So this form is deliberately the whole of it: file, name, category.
 * Everything after that is machinery the catalogue already has - the
 * grid below sets it live, the set builder puts it in a pack - and a
 * Rive cosmetic travels all of it exactly like a hand-built one. It
 * lands as a draft every time, because a cosmetic that goes live the
 * instant a file uploads is one nobody looked at first.
 *
 * A plain form posting to a route, not a Server Action: the body is a
 * file, and the multipart route is the upload path proven to survive
 * the founder's network.
 */
export function RiveDrop() {
  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <Upload className="mt-0.5 size-5 shrink-0 text-accent" aria-hidden="true" />
        <div className="flex flex-col gap-1">
          <h2 className="font-semibold text-text-primary">Drop in a Rive file</h2>
          <p className="text-sm text-text-secondary">
            Export from Rive as .riv, pick a category, give it a name. It appears in the
            grid below as a draft, previews there and in Customize, and can go into a
            set like anything else. Four megabytes at most.
          </p>
        </div>
      </div>

      <form
        action="/api/admin/rive"
        method="post"
        encType="multipart/form-data"
        className="flex flex-col gap-3"
      >
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-text-secondary">The file</span>
          <input
            type="file"
            name="rive"
            accept=".riv,application/octet-stream"
            required
            className="cursor-pointer rounded-[var(--radius-control)] border border-border bg-elevated px-3 py-2 text-sm text-text-primary file:mr-3 file:cursor-pointer file:rounded-full file:border-0 file:bg-surface file:px-3 file:py-1 file:text-sm file:text-text-secondary"
          />
        </label>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-text-secondary">Name</span>
            <input
              type="text"
              name="name"
              required
              maxLength={60}
              placeholder="Frost"
              className="rounded-[var(--radius-control)] border border-border bg-elevated px-3 py-2 text-sm text-text-primary placeholder:text-text-muted"
            />
            <span className="text-xs text-text-muted">
              The colour, not the category: Frost, not Frost Border.
            </span>
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-text-secondary">Category</span>
            <select
              name="kind"
              defaultValue="ring"
              className="rounded-[var(--radius-control)] border border-border bg-elevated px-3 py-2 text-sm text-text-primary"
            >
              {CATALOG_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {KIND_LABELS[kind]?.title ?? kind}
                </option>
              ))}
            </select>
          </label>
        </div>

        <details className="rounded-[var(--radius-control)] border border-border bg-elevated/50 p-3">
          <summary className="cursor-pointer text-sm font-medium text-text-secondary">
            Artboard and state machine (only if the file has several)
          </summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5">
              <span className="text-sm text-text-secondary">Artboard</span>
              <input
                type="text"
                name="artboard"
                maxLength={80}
                placeholder="Leave blank for the default"
                className="rounded-[var(--radius-control)] border border-border bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-muted"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm text-text-secondary">State machine</span>
              <input
                type="text"
                name="stateMachine"
                maxLength={80}
                placeholder="Leave blank for the default"
                className="rounded-[var(--radius-control)] border border-border bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-muted"
              />
            </label>
          </div>
        </details>

        <button
          type="submit"
          className="w-fit cursor-pointer rounded-[var(--radius-control)] bg-accent px-4 py-2 text-sm font-semibold text-accent-contrast transition-colors hover:bg-accent-hover"
        >
          Add it to the catalogue
        </button>
      </form>
    </Card>
  );
}
