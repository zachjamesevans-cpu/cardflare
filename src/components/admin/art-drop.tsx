"use client";

import { useRef, useState } from "react";
import { Upload } from "lucide-react";

import { Card } from "@/components/ui/card";

/**
 * Dropping cosmetic art into the catalogue: Rive, SVG, or a Figma .tsx.
 *
 * The founder's ask: "would be cool to be able to drop these in to
 * cardflare, and I can edit the name of the cosmetic and whatnot,
 * define which folder it should go in such as profile border or holo,
 * etc. and other relevant settings."
 *
 * So the form carries the settings, and the file type is just a
 * detail it works out for itself:
 *
 *   .riv  - uploaded as it is, played by the Rive runtime.
 *   .svg  - uploaded as it is, scrubbed on the way in.
 *   .tsx  - a Figma export: a React component that draws an SVG. It is
 *           converted HERE, in this browser, and the resulting drawing
 *           is what uploads.
 *
 * That last one is the reason this is a client component. Running a
 * component from a file upload on the server would put somebody else's
 * code in the same process as the service-role key; running it in the
 * admin's own browser is the same trust as opening the file in the
 * editor he exported it from. The server only ever receives a .riv or
 * finished SVG markup, and scrubs the markup before storing it.
 */

type Stage =
  | { state: "idle" }
  | { state: "busy"; said: string }
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
  const form = useRef<HTMLFormElement>(null);
  const [stage, setStage] = useState<Stage>({ state: "idle" });

  /**
   * A Figma .tsx, turned into a drawing without leaving this page.
   *
   * React is already here, so the component is rendered into a
   * detached node and the SVG it drew is read back out. sucrase and
   * the converter are pulled in only when a .tsx is actually dropped -
   * no page pays for a transformer it never uses.
   */
  async function convertTsx(source: string): Promise<string | null> {
    const [{ tsxToSvg }, { createRoot }, { flushSync }] = await Promise.all([
      import("@/lib/admin/tsx-to-svg"),
      import("react-dom/client"),
      import("react-dom"),
    ]);

    const host = document.createElement("div");
    /* Off-screen rather than display:none - a hidden subtree still
       renders, and this only has to exist long enough to be read. */
    host.style.cssText = "position:fixed;left:-10000px;top:0;width:400px;height:400px";
    document.body.appendChild(host);

    const root = createRoot(host);
    try {
      const result = tsxToSvg(source, (element) => {
        flushSync(() => root.render(element));
        return host.innerHTML;
      });

      if (!result.ok) {
        const { TSX_REJECTION_COPY } = await import("@/lib/admin/tsx-to-svg");
        setStage({ state: "error", said: TSX_REJECTION_COPY[result.reason] });
        return null;
      }
      return result.svg;
    } finally {
      root.unmount();
      host.remove();
    }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    const element = event.currentTarget;
    const data = new FormData(element);
    const file = data.get("file");

    if (!(file instanceof File) || file.size === 0) {
      event.preventDefault();
      setStage({ state: "error", said: "Pick a file first." });
      return;
    }

    const name = file.name.toLowerCase();

    /* A .riv goes as it is: the plain multipart post, unchanged. */
    if (name.endsWith(".riv")) {
      data.set("rive", file);
      data.delete("file");
      event.preventDefault();
      void send(data);
      return;
    }

    event.preventDefault();
    setStage({ state: "busy", said: "Reading the file…" });

    const text = await file.text();
    let svg: string | null = null;

    if (name.endsWith(".tsx") || name.endsWith(".jsx")) {
      setStage({ state: "busy", said: "Converting the component…" });
      svg = await convertTsx(text);
      if (!svg) return;
    } else if (name.endsWith(".svg")) {
      svg = text;
    } else {
      setStage({
        state: "error",
        said: "Drop a .riv, an .svg, or a Figma .tsx. Nothing else is art.",
      });
      return;
    }

    data.set("svg", svg);
    data.delete("file");
    void send(data);
  }

  async function send(data: FormData) {
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
      setStage({ state: "error", said: "That did not reach the server. Try again." });
    }
  }

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <Upload className="mt-0.5 size-5 shrink-0 text-accent" aria-hidden="true" />
        <div className="flex flex-col gap-1">
          <h2 className="font-semibold text-text-primary">Drop in cosmetic art</h2>
          <p className="text-sm text-text-secondary">
            A Rive file (.riv), a drawing (.svg), or a Figma export (.tsx) - the
            component is converted to a drawing here in your browser. Pick the category,
            name it, and it lands in the grid below as a draft.
          </p>
        </div>
      </div>

      <form
        ref={form}
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
            accept=".riv,.svg,.tsx,.jsx"
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

        <details className="rounded-[var(--radius-control)] border border-border bg-elevated/50 p-3">
          <summary className="cursor-pointer text-sm font-medium text-text-secondary">
            Rive artboard and state machine (only if the file has several)
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

        <p className="text-xs text-text-muted">
          For a profile border, leave the middle transparent and draw the ring at radius
          152 in a 400 by 400 box, so a real picture fills the middle. A Figma
          frame&apos;s background and placeholder avatar have to go.
        </p>
      </form>
    </Card>
  );
}
