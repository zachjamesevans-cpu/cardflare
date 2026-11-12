import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * What a page downloads before anybody has touched it.
 *
 * Two rules, pinned so neither comes undone quietly:
 *
 * - Card art in a list, a rail or a grid is fetched as it nears the
 *   screen (`loading="lazy"`), not all at once with the page.
 * - A sheet that is only seen after a tap is loaded by that tap
 *   (`next/dynamic`), from the component that opens it, and that
 *   component no longer imports it outright. One static import
 *   anywhere on a route puts the sheet back in the route's first
 *   download, which is why each opener is named here.
 */

const ROOT = resolve(import.meta.dirname, "../..");
const read = (path: string) => readFileSync(resolve(ROOT, path), "utf8");

/** Every `<img ...>` tag in a file, as written. */
const images = (source: string) => source.match(/<img\b[^>]*\/>/g) ?? [];

describe("card art loads as it nears the screen", () => {
  it.each([
    "src/components/feed/feed-tile.tsx",
    "src/components/feed/feed-items.tsx",
    "src/components/binder/pockets.tsx",
    "src/components/binder/paste-list.tsx",
    "src/components/binder/binder-picker.tsx",
    "src/components/nearby/wanted-list.tsx",
    "src/components/trades/history.tsx",
    "src/components/trades/flare-history-row.tsx",
    "src/components/trades/log-trade-sheet.tsx",
    "src/components/feed/flare-cards-sheet.tsx",
    "src/components/feed/flare-progress-sheet.tsx",
    "src/components/feed/everything-search.tsx",
    "src/components/feed/store-post-card.tsx",
    "src/components/flares/card-picker.tsx",
    "src/components/flares/offer-review.tsx",
    "src/components/flares/composer-sheets.tsx",
    "src/components/cards/page-check.tsx",
  ])("%s", (path) => {
    const found = images(read(path));
    expect(found.length).toBeGreaterThan(0);
    for (const tag of found) {
      expect(tag).toContain('loading="lazy"');
      expect(tag).toContain('decoding="async"');
    }
  });

  it("leaves the first thing on a screen eager", () => {
    /* A profile's cover and a store's logo are what the screen opens
       on: lazy would only make them later. */
    for (const path of [
      "src/components/players/profile-cover.tsx",
      "src/components/stores/store-page-header.tsx",
    ]) {
      for (const tag of images(read(path))) {
        expect(tag).not.toContain('loading="lazy"');
      }
    }
  });
});

describe("a sheet behind a tap is loaded by the tap", () => {
  const deferred: [opener: string, component: string, module: string][] = [
    [
      "src/components/binder/binder-page.tsx",
      "AddBinderCard",
      "@/components/binder/add-binder-card",
    ],
    [
      "src/components/binder/binder-page.tsx",
      "BinderSettings",
      "@/components/binder/binder-settings",
    ],
    [
      "src/components/binder/binder-page.tsx",
      "QueueCheck",
      "@/components/cards/queue-check",
    ],
    [
      "src/components/binder/binder-page.tsx",
      "OfferReview",
      "@/components/flares/offer-review",
    ],
    [
      "src/components/cards/card-image-zoom.tsx",
      "OfferReview",
      "@/components/flares/offer-review",
    ],
    [
      "src/components/feed/post-actions.tsx",
      "OfferReview",
      "@/components/flares/offer-review",
    ],
    [
      "src/components/feed/post-actions.tsx",
      "FlareProgressSheet",
      "@/components/feed/flare-progress-sheet",
    ],
    [
      "src/components/feed/post-actions.tsx",
      "ReportSheet",
      "@/components/players/report-sheet",
    ],
    [
      "src/components/feed/post-social.tsx",
      "ReportSheet",
      "@/components/players/report-sheet",
    ],
    [
      "src/components/players/profile-menu.tsx",
      "ReportSheet",
      "@/components/players/report-sheet",
    ],
    [
      "src/components/players/add-showcase-form.tsx",
      "CardSearch",
      "@/components/cards/card-search",
    ],
    [
      "src/components/trades/log-trade-sheet.tsx",
      "CardSearch",
      "@/components/cards/card-search",
    ],
    [
      "src/components/players/avatar-form.tsx",
      "ImageCropper",
      "@/components/players/image-cropper",
    ],
    [
      "src/components/players/cover-form.tsx",
      "ImageCropper",
      "@/components/players/image-cropper",
    ],
    [
      "src/components/stores/store-image-form.tsx",
      "ImageCropper",
      "@/components/players/image-cropper",
    ],
  ];

  it.each(deferred)("%s loads %s on demand", (opener, component, module) => {
    const source = read(opener);
    expect(source).toContain('import dynamic from "next/dynamic";');
    expect(source).toMatch(
      new RegExp(
        `const ${component} = dynamic\\(\\s*\\(\\) =>\\s*import\\("${module}"\\)\\.then\\(\\(m\\) => m\\.${component}\\)`,
      ),
    );
    /* Types may still come from the module; a value import may not,
       or the bundler keeps the whole file in the page. */
    const statics = source.match(
      new RegExp(`^import (?!type )[^;]*from "${module}";`, "gm"),
    );
    expect(statics).toBeNull();
  });

  it("draws an always-mounted sheet only from its first opening", () => {
    const hook = read("src/components/ui/use-opened.ts");
    expect(hook).toContain("export function useOpened(open: boolean): boolean {");
    expect(hook).toContain("if (open && !opened) setOpened(true);");
    expect(hook).toContain("return open || opened;");

    const binder = read("src/components/binder/binder-page.tsx");
    expect(binder).toContain("const addOpened = useOpened(adding !== null);");
    expect(binder).toContain("{addOpened && (");
    expect(binder).toContain("const reviewOpened = useOpened(offers.reviewOpen);");
    expect(binder).toContain("{picking && reviewOpened && (");
    /* A queue's check is drawn while there is a queue to check. */
    expect(binder).toContain("{checking && (");
    expect(binder).toContain("key={checking}");

    const zoom = read("src/components/cards/card-image-zoom.tsx");
    expect(zoom).toContain("const reviewOpened = useOpened(local.reviewOpen);");
    expect(zoom).toContain("{!shared && feedPostId && reviewOpened && (");

    const actions = read("src/components/feed/post-actions.tsx");
    expect(actions).toContain("const reviewOpened = useOpened(build.reviewOpen);");
    expect(actions).toContain(
      'const progressOpened = useOpened(sheet === "progress");',
    );
    expect(actions).toContain('const reportOpened = useOpened(sheet === "report");');
  });

  it("opens the Add cards sheet for a retake straight into the scanner", () => {
    /* The sheet is first drawn already open, so the reset that runs on
       a later opening has not run: the scanner's start says the same. */
    const add = read("src/components/binder/add-binder-card.tsx");
    expect(add).toContain(
      "const [scanning, setScanning] = useState(open && Boolean(retake));",
    );
    expect(add).toContain("setScanning(Boolean(retake));");
  });

  it("keeps the list of a post's cards drawn, closed, from the start", () => {
    /* Closed, it is already listening for an offer sent from a card's
       viewer, so the card reads OFFERED the moment the list opens. */
    const actions = read("src/components/feed/post-actions.tsx");
    expect(actions).toContain(
      'import { FlareCardsSheet } from "@/components/feed/flare-cards-sheet";',
    );
    const sheet = read("src/components/feed/flare-cards-sheet.tsx");
    expect(sheet).toContain('window.addEventListener("cardflare:offered", onOffered);');
  });
});

describe("the validation library stays off the pages players open", () => {
  /*
   * zod is 62 KB on the wire. A client component that imports one
   * constant from a file with a schema in it takes all of zod with it,
   * and that is how the Feed, a profile, a binder, Messages, the
   * composer and the event room each came to download it. The files
   * the browser reads are held free of it here.
   */
  const zodFree = [
    "src/lib/cards/schema.ts",
    "src/lib/matching/schema.ts",
    "src/lib/players/name-rules.ts",
    "src/lib/players/profile-state.ts",
    "src/lib/shows/slab-label.ts",
    "src/lib/events/join-code.ts",
    "src/lib/players/handle.ts",
    "src/lib/auth/signup-rules.ts",
    "src/lib/auth/password-rules.ts",
  ];

  it.each(zodFree)("%s imports no zod", (file) => {
    const source = read(file);
    expect(source).not.toMatch(/from "zod"/);
    /* Nor a neighbour that does. */
    expect(source).not.toMatch(/from "@\/lib\/players\/schema"/);
    expect(source).not.toMatch(/from "\.\/(profile-schema|offer-schema|query-schema)"/);
  });

  it("keeps the schemas themselves, in files only the server reads", () => {
    expect(read("src/lib/cards/query-schema.ts")).toContain(
      "export const cardQuerySchema = z",
    );
    expect(read("src/lib/matching/offer-schema.ts")).toContain(
      "export const offerMessageSchema = z",
    );
    expect(read("src/lib/matching/offer-schema.ts")).toContain(
      "export const offerQuantitySchema = z",
    );
    /* And the old import paths still work for the server. */
    expect(read("src/lib/players/schema.ts")).toContain(
      'export * from "./name-rules";',
    );
    expect(read("src/lib/players/profile-schema.ts")).toContain(
      'export * from "./profile-state";',
    );
    expect(read("src/lib/shows/schema.ts")).toContain(
      'export { slabLabel } from "./slab-label";',
    );
  });

  it("keeps sign-up, the first page a new player loads, off zod too", () => {
    const form = read("src/components/auth/signup-form.tsx");
    expect(form).toContain('from "@/lib/auth/signup-rules"');
    expect(form).not.toContain('from "@/lib/auth/signup-schema"');
    expect(read("src/lib/players/handle-schema.ts")).toContain(
      "export const handleSchema = z.object({",
    );
    expect(read("src/lib/auth/signup-schema.ts")).toContain(
      'export * from "./signup-rules";',
    );
    expect(read("src/lib/auth/schema.ts")).toContain(
      'export * from "./password-rules";',
    );
  });

  it("points the browser's components at the zod-free files", () => {
    expect(read("src/components/events/join-event-form.tsx")).toContain(
      'from "@/lib/players/name-rules"',
    );
    expect(read("src/components/shows/show-search.tsx")).toContain(
      'from "@/lib/shows/slab-label"',
    );
    for (const file of [
      "src/components/players/showcase-editor.tsx",
      "src/components/players/avatar-form.tsx",
      "src/components/players/cover-form.tsx",
      "src/components/players/cosmetic-shop.tsx",
      "src/components/players/edit-profile-rows.tsx",
    ]) {
      expect(read(file)).toContain('from "@/lib/players/profile-state"');
      expect(read(file)).not.toContain('from "@/lib/players/profile-schema"');
    }
  });
});
