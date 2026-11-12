import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

/**
 * The composer posts from the compose step; the preview is optional.
 *
 * It used to be select, compose, preview, post, with the preview a step
 * nobody could skip. Now the compose step's primary button posts, and
 * "Preview" beside it opens the same look as before. Neither screen can
 * be rendered here, so the buttons, their order and the guard against a
 * second post are read off the source, on both platforms.
 */
const read = (path: string) => readFileSync(path, "utf8");

const web = read("src/components/flares/flare-composer.tsx");
const webPreview = read("src/components/flares/flare-composer-preview.tsx");
const app = read("mobile/src/screens/flare-composer.tsx");

/** The app keeps its preview in the composer's own file. */
const appPreview = app.slice(app.indexOf("export function FlareComposerPreview("));
const appCompose = app.slice(0, app.indexOf("export function FlareComposerPreview("));

/** Asserts each needle is present and that they come in this order. */
function inOrder(source: string, needles: string[]) {
  let from = 0;
  for (const needle of needles) {
    const at = source.indexOf(needle, from);
    expect(at, `"${needle}" after position ${from}`).toBeGreaterThanOrEqual(0);
    from = at + needle.length;
  }
}

describe("the compose step posts", () => {
  it("has Post flare first and Preview second on the website", () => {
    /* The footer row: everything after the caption field. */
    const footer = web.slice(
      web.indexOf('<div className="flex flex-wrap items-center'),
    );
    inOrder(footer, [
      "onClick={post}",
      "disabled={pending || draft.cards.length === 0}",
      '{pending ? "Posting…" : "Post flare"}',
      'variant="secondary"',
      'setStep("preview");',
      "Preview",
      "Clear draft",
    ]);
  });

  it("has Post flare first and Preview second in the app", () => {
    inOrder(appCompose, [
      "<ErrorLine message={error} />",
      "<AsyncButton",
      'label="Post flare"',
      'pendingLabel="Posting…"',
      "onPress={post}",
      "<Button",
      'label="Preview"',
      'variant="secondary"',
      "setPreviewing(true);",
    ]);
  });

  it("says the same thing about an empty draft on both", () => {
    expect(web).toContain("Add at least one card to post.");
    expect(app).toContain("Add at least one card to post.");
    expect(app).not.toContain("to preview the post");
  });
});

describe("one post, however many buttons", () => {
  it("runs every Post button on the website through one guarded function", () => {
    expect(web).toContain("if (pending || draft.cards.length === 0) return;");
    /* The compose step and the preview are handed the same `post`. */
    expect(web).toContain("onClick={post}");
    expect(web).toContain("onPost={post}");
    expect(web).toContain("pending={pending}");
    expect(web.match(/publishPostAction\(/g)).toHaveLength(1);
  });

  it("refuses a second post in the app while one is in the air", () => {
    /* Each AsyncButton only guards its own tap, and there are two now:
       the function itself has to refuse re-entry. */
    inOrder(appCompose, [
      "const postRunning = useRef(false);",
      "const post = async () => {",
      "if (postRunning.current || draft.items.length === 0) return;",
      "postRunning.current = true;",
      "publishFlare({",
      "} finally {",
      "postRunning.current = false;",
    ]);
    expect(appCompose).toContain("onPress={post}");
    expect(appCompose).toContain("onPost={post}");
    expect(app.match(/publishFlare\(/g)).toHaveLength(1);
  });

  it("still shows a refusal where the tap was made", () => {
    /* The compose step draws the error itself; so does the preview. */
    expect(web).toContain('<p role="alert" className="text-sm text-danger">');
    expect(webPreview).toContain('<p role="alert" className="text-sm text-danger">');
    expect(appCompose).toContain("<ErrorLine message={error} />");
    expect(appPreview).toContain("<ErrorLine message={error} />");
  });
});

describe("the preview is still there, and optional", () => {
  it("keeps its own Post flare and Back to editing, in that order, on both", () => {
    inOrder(webPreview, [
      "onClick={onPost}",
      '{pending ? "Posting…" : "Post flare"}',
      "onClick={onBack}",
      "Back to editing",
    ]);
    inOrder(appPreview, [
      "<AsyncButton",
      'label="Post flare"',
      'pendingLabel="Posting…"',
      "onPress={onPost}",
      'label="Back to editing"',
      "onPress={onBack}",
    ]);
  });

  it("introduces itself in the same words on both", () => {
    expect(webPreview).toContain("This is how it will look in the Feed.");
    expect(appPreview).toContain("This is how it will look in the Feed.");
  });

  it("is not a step on the app's strip any more", () => {
    expect(app).toContain('type Step = "select" | "compose";');
    const strip = app.slice(app.indexOf("function StepStrip("));
    const steps = strip.slice(strip.indexOf("const steps"), strip.indexOf("];"));
    expect(steps).toContain('{ key: "select", label: "Select cards" }');
    expect(steps).toContain('{ key: "compose", label: "Compose" }');
    expect(steps).not.toContain("preview");
    expect(steps.match(/key: "/g)).toHaveLength(2);
  });
});

describe("what did not change", () => {
  it("leaves every Flare a want", () => {
    /* Offering was removed on 2026-10-15; shortening the flow must not
       bring a direction choice back. */
    expect(app).toContain('intent: "want",');
    expect(web).toContain('intent: "want"');
    expect(app).not.toContain('label="Offering"');
    expect(web).not.toContain(">Offering<");
  });
});
