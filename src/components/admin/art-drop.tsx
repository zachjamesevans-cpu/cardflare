"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy, Upload } from "lucide-react";

import { Card } from "@/components/ui/card";
import { FIGMA_BRIEF } from "@/lib/admin/figma-brief";
import type { ArtMarkup } from "@/lib/admin/tsx-to-art";

/**
 * Dropping cosmetic art into the catalogue: a Figma .tsx, an .svg, or a
 * Rive file from before we stopped using Rive.
 *
 * The founder's ask, twice: "would be cool to be able to drop these in
 * to cardflare, and I can edit the name of the cosmetic and whatnot,
 * define which folder it should go in", and then, after a Figma export
 * that drew with divs was turned away, "please make it so I can just
 * drop in the .tsx files. as well as a preview built in to that screen
 * of what it would look like running."
 *
 * So the form carries the settings, and the file type is a detail it
 * works out for itself:
 *
 *   .tsx  - a Figma export. Converted HERE, in this browser, into
 *           either a drawing or HTML art depending on what it drew.
 *   .svg  - a drawing, as it is.
 *   .riv  - uploaded as it is, played by the Rive runtime.
 *
 * That first one is why this is a client component. Running a component
 * from a file upload on the server would put somebody else's code in
 * the same process as the service-role key; running it in the admin's
 * own browser is the same trust as opening the file in the editor he
 * exported it from. The server only ever receives finished markup, and
 * scrubs it before storing it.
 *
 * The preview is the same conversion, drawn the same way a player will
 * see it - so what he approves here is literally the artefact that
 * uploads, not an impression of it.
 */

type Stage =
  | { state: "idle" }
  | { state: "busy"; said: string }
  | { state: "ready"; art: ArtMarkup }
  | { state: "error"; said: string };

const KINDS: { value: string; label: string }[] = [
  { value: "ring", label: "Profile borders" },
  { value: "aura", label: "Avatar effects" },
  { value: "border", label: "Card borders" },
  { value: "pattern", label: "Holo patterns" },
  { value: "animation", label: "Card animations" },
  { value: "background", label: "Showcase backgrounds" },
  { value: "scene", label: "Profile effects" },
  { value: "nameplate", label: "Name styles" },
  { value: "title", label: "Titles" },
  { value: "badge", label: "Badges" },
  { value: "frame", label: "Frames (live)" },
  { value: "holo", label: "Holos (live)" },
  { value: "effect", label: "Effects (live)" },
];

export function ArtDrop() {
  const [stage, setStage] = useState<Stage>({ state: "idle" });
  /* A .riv never converts, so it is held aside until submit. */
  const [riveFile, setRiveFile] = useState<File | null>(null);

  /**
   * A Figma .tsx or an .svg, turned into art without leaving this page.
   *
   * Rendered with renderToStaticMarkup rather than into a live root:
   * it is the same call the unit test makes, so the preview, the test
   * and the upload cannot disagree, and a component that throws throws
   * HERE where the message can be shown. Rendering into a real root
   * swallowed the error and reported "drew no SVG" for a file that had
   * actually died on its first line - which is exactly the misleading
   * message the founder hit.
   */
  async function convert(name: string, text: string): Promise<ArtMarkup | null> {
    if (name.endsWith(".svg")) {
      const { sanitizeSvg, SVG_REJECTION_COPY } = await import("@/lib/admin/svg-file");
      const clean = sanitizeSvg(text);
      if (!clean.ok) {
        setStage({ state: "error", said: SVG_REJECTION_COPY[clean.reason] });
        return null;
      }
      return { kind: "svg", markup: clean.svg };
    }

    const [{ tsxToArt, TSX_REJECTION_COPY }, server] = await Promise.all([
      import("@/lib/admin/tsx-to-art"),
      import("react-dom/server.browser"),
    ]);

    const converted = tsxToArt(text, server.renderToStaticMarkup);
    if (!converted.ok) {
      setStage({ state: "error", said: TSX_REJECTION_COPY[converted.reason] });
      return null;
    }

    /* Scrubbed here too, so the preview is the scrubbed art rather
       than the raw one. The server scrubs again on arrival; that is
       the authoritative pass and this is the honest picture. */
    if (converted.kind === "svg") {
      const { sanitizeSvg, SVG_REJECTION_COPY } = await import("@/lib/admin/svg-file");
      const clean = sanitizeSvg(converted.markup);
      if (!clean.ok) {
        setStage({ state: "error", said: SVG_REJECTION_COPY[clean.reason] });
        return null;
      }
      return { kind: "svg", markup: clean.svg };
    }

    const { sanitizeHtml, HTML_REJECTION_COPY } = await import("@/lib/admin/html-file");
    const clean = sanitizeHtml(converted.markup);
    if (!clean.ok) {
      setStage({ state: "error", said: HTML_REJECTION_COPY[clean.reason] });
      return null;
    }
    return { kind: "html", markup: clean.html };
  }

  async function pick(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0] ?? null;
    setRiveFile(null);

    if (!file) {
      setStage({ state: "idle" });
      return;
    }

    const name = file.name.toLowerCase();

    if (name.endsWith(".riv")) {
      setRiveFile(file);
      setStage({
        state: "error",
        said: "Rive files upload without a preview. Everything else previews here.",
      });
      return;
    }

    if (!/\.(tsx|jsx|svg)$/.test(name)) {
      setStage({
        state: "error",
        said: "Drop a Figma .tsx, an .svg, or a .riv. Nothing else is art.",
      });
      return;
    }

    setStage({ state: "busy", said: "Converting…" });
    const art = await convert(name, await file.text());
    if (art) setStage({ state: "ready", art });
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    data.delete("file");

    if (riveFile) {
      data.set("rive", riveFile);
    } else if (stage.state === "ready") {
      data.set("markup", stage.art.markup);
      data.set("markupKind", stage.art.kind);
    } else {
      setStage({ state: "error", said: "Pick a file first." });
      return;
    }

    const said = stage.state === "ready" ? stage.art : null;
    setStage({ state: "busy", said: "Uploading…" });

    try {
      /* The route answers with a redirect back to this page carrying
         the outcome, so following it IS the result. */
      const response = await fetch("/api/admin/cosmetic-art", {
        method: "POST",
        body: data,
      });
      window.location.href = response.url || "/admin/packs";
    } catch {
      setStage({
        state: said ? "ready" : "error",
        ...(said ? { art: said } : { said: "That did not reach the server." }),
      } as Stage);
    }
  }

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <Upload className="mt-0.5 size-5 shrink-0 text-accent" aria-hidden="true" />
        <div className="flex flex-col gap-1">
          <h2 className="font-semibold text-text-primary">Drop in cosmetic art</h2>
          <p className="text-sm text-text-secondary">
            A Figma export (.tsx) or a drawing (.svg). The component is converted here
            in your browser and previewed below exactly as players will see it. Pick the
            category, name it, and it lands in the grid as a draft.
          </p>
        </div>
      </div>

      <FigmaBrief />

      <form
        action="/api/admin/cosmetic-art"
        method="post"
        encType="multipart/form-data"
        onSubmit={submit}
        className="flex flex-col gap-3"
      >
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-text-secondary">The file</span>
          <input
            type="file"
            name="file"
            accept=".tsx,.jsx,.svg,.riv"
            required
            onChange={pick}
            className="cursor-pointer rounded-[var(--radius-control)] border border-border bg-elevated px-3 py-2 text-sm text-text-primary file:mr-3 file:cursor-pointer file:rounded-full file:border-0 file:bg-surface file:px-3 file:py-1 file:text-sm file:text-text-secondary"
          />
        </label>

        {stage.state === "ready" && <ArtPreview art={stage.art} />}

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-text-secondary">Name</span>
            <input
              type="text"
              name="name"
              required
              maxLength={60}
              placeholder="Lightning"
              className="rounded-[var(--radius-control)] border border-border bg-elevated px-3 py-2 text-sm text-text-primary placeholder:text-text-muted"
            />
            <span className="text-xs text-text-muted">
              The colour, not the category: Lightning, not Lightning Border.
            </span>
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-text-secondary">Category</span>
            <select
              name="kind"
              defaultValue="ring"
              className="rounded-[var(--radius-control)] border border-border bg-elevated px-3 py-2 text-sm text-text-primary"
            >
              {KINDS.map((kind) => (
                <option key={kind.value} value={kind.value}>
                  {kind.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-text-secondary">
            Description <span className="font-normal text-text-muted">(optional)</span>
          </span>
          <input
            type="text"
            name="description"
            maxLength={200}
            placeholder="Red arcs cracking around the picture."
            className="rounded-[var(--radius-control)] border border-border bg-elevated px-3 py-2 text-sm text-text-primary placeholder:text-text-muted"
          />
        </label>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={stage.state === "busy"}
            className="w-fit cursor-pointer rounded-[var(--radius-control)] bg-accent px-4 py-2 text-sm font-semibold text-accent-contrast transition-colors hover:bg-accent-hover disabled:opacity-70"
          >
            {stage.state === "busy" ? stage.said : "Add it to the catalogue"}
          </button>
          {stage.state === "error" && (
            <p role="status" className="text-sm text-danger">
              {stage.said}
            </p>
          )}
        </div>
      </form>
    </Card>
  );
}

/** The brief to paste above a Figma Make prompt, ready to copy. */
function FigmaBrief() {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  return (
    <details className="rounded-[var(--radius-control)] border border-border bg-elevated/50 p-3">
      <summary className="cursor-pointer text-sm font-medium text-text-secondary">
        Paste this above your Figma prompt
      </summary>
      <div className="mt-3 flex flex-col gap-2">
        <p className="text-xs text-text-muted">
          Every line of this is here because an export got it wrong once. With it, what
          comes back drops straight in.
        </p>
        <pre className="max-h-64 overflow-auto rounded-[var(--radius-control)] border border-border bg-surface p-3 text-xs whitespace-pre-wrap text-text-secondary">
          {FIGMA_BRIEF}
        </pre>
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard.writeText(FIGMA_BRIEF).then(() => setCopied(true));
          }}
          className="flex w-fit cursor-pointer items-center gap-1.5 rounded-[var(--radius-control)] border border-border px-3 py-1.5 text-xs text-text-secondary transition-colors hover:text-text-primary"
        >
          {copied ? (
            <Check className="size-3.5 text-accent" aria-hidden="true" />
          ) : (
            <Copy className="size-3.5" aria-hidden="true" />
          )}
          {copied ? "Copied" : "Copy the brief"}
        </button>
      </div>
    </details>
  );
}

/**
 * The converted art, running, at the sizes it will actually be worn.
 *
 * Three views, each answering a question the founder has asked before:
 * does it cover my face (worn over a picture at profile size), does it
 * survive being small (roster size), and is the middle actually
 * transparent (on a checkerboard, where an opaque background is
 * impossible to miss).
 *
 * Drawn with the same two renderers players get - an `<img>` for a
 * drawing, a script-free sandboxed frame for HTML - so this is the
 * artefact, not an impression of it.
 */
function ArtPreview({ art }: { art: ArtMarkup }) {
  const [src, setSrc] = useState<string | null>(null);
  const [doc, setDoc] = useState<string | null>(null);
  const url = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function build() {
      if (art.kind === "svg") {
        const blob = new Blob([art.markup], { type: "image/svg+xml" });
        const made = URL.createObjectURL(blob);
        url.current = made;
        if (!cancelled) setSrc(made);
        return;
      }
      const { artDocument } = await import("@/lib/admin/html-file");
      if (!cancelled) setDoc(artDocument(art.markup));
    }

    void build();

    return () => {
      cancelled = true;
      if (url.current) {
        URL.revokeObjectURL(url.current);
        url.current = null;
      }
    };
  }, [art]);

  const film = (
    <>
      {art.kind === "svg" && src && (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img src={src} alt="" aria-hidden="true" className="block size-full" />
      )}
      {art.kind === "html" && doc && (
        <iframe
          srcDoc={doc}
          title=""
          aria-hidden="true"
          tabIndex={-1}
          sandbox=""
          scrolling="no"
          className="block size-full border-0 bg-transparent"
        />
      )}
    </>
  );

  return (
    <div className="flex flex-col gap-3 rounded-[var(--radius-control)] border border-border bg-elevated/50 p-3">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-text-secondary">Running preview</span>
        <span className="rounded-full border border-border px-2 py-0.5 text-xs text-text-muted">
          {art.kind === "svg" ? "drawing" : "html + css"}
        </span>
      </div>

      <div className="flex flex-wrap items-end gap-6">
        <figure className="flex flex-col items-center gap-2">
          <span className="cfx-preview-face size-24">
            <span className="cfx-ring-film">{film}</span>
          </span>
          <figcaption className="text-xs text-text-muted">Worn, profile</figcaption>
        </figure>

        <figure className="flex flex-col items-center gap-2">
          <span className="cfx-preview-face size-10">
            <span className="cfx-ring-film">{film}</span>
          </span>
          <figcaption className="text-xs text-text-muted">Worn, roster</figcaption>
        </figure>

        <figure className="flex flex-col items-center gap-2">
          <span className="cfx-preview-checker size-40">{film}</span>
          <figcaption className="text-xs text-text-muted">
            On its own. Grey shows through
          </figcaption>
        </figure>
      </div>

      <p className="text-xs text-text-muted">
        The worn views clip anything drawn inside the picture, so a face is never
        covered. If the middle looks solid on the checkerboard, the art has a background
        that wants deleting.
      </p>
    </div>
  );
}
