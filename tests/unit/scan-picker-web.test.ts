import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { ViewerItem } from "@/components/cards/card-viewer";
import type { CardResult } from "@/lib/cards/schema";
import * as rules from "@/lib/cards/scan-rules";

/**
 * The scan check's picker, its guesses and the binder's waiting line, on
 * the website. The founder:
 *
 * - The card picker in the scan check is the Flare screen's picker
 *   "down to the pixel", except "when you click a card, it doesn't add
 *   a '1' to it, then counts up. it's just one card, so adding the card
 *   should close that screen."
 * - A pocket the reader could not place says "Might be one of these"
 *   over the catalogue's closest cards to what it saw.
 * - The queue's line wears the spinner until it is ready, so it does
 *   not look static.
 */

/* The components import Server Actions; the tests never call them. */
vi.mock("@/lib/cards/scan-actions", () => ({
  scanCardAction: vi.fn(),
  scanPageAction: vi.fn(),
  scannerAccessAction: vi.fn(),
  scanRightsAction: vi.fn(),
}));
vi.mock("@/lib/cards/page-job-actions", () => ({
  sendPageAction: vi.fn(),
  queuesForAction: vi.fn(),
  queueViewAction: vi.fn(),
  placeQueueAction: vi.fn(),
  discardQueueAction: vi.fn(),
}));
vi.mock("@/lib/cards/actions", () => ({ searchCardsAction: vi.fn() }));

const read = (path: string) =>
  readFileSync(resolve(import.meta.dirname, "../..", path), "utf8");

const viewer = read("src/components/cards/card-viewer.tsx");
const picker = read("src/components/flares/card-picker.tsx");
const composer = read("src/components/flares/flare-composer.tsx");
const check = read("src/components/cards/page-check.tsx");
const queues = read("src/components/binder/page-queues.tsx");

/** The code alone: a comment may name a prop, the code may not use it. */
const code = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/** One function's source, from its name to the next top-level declaration. */
const fn = (source: string, name: string) => {
  const start = source.search(new RegExp(`function ${name}\\b`));
  expect(start, name).toBeGreaterThan(-1);
  const rest = source.slice(start + 1);
  const end = rest.search(/\n(?:export )?(?:function|const|type|interface) /);
  return end === -1 ? rest : rest.slice(0, end);
};

const card = (id: string, name: string, number: string): CardResult => ({
  id,
  exactName: name,
  canonicalCardNumber: number,
  cardType: "Character",
  colors: ["Purple"],
  traits: [],
  cost: 4,
  power: 5000,
  counter: null,
  life: null,
  rarity: null,
  effectText: null,
  triggerText: null,
  printings: [],
});

const unread = (suggestions?: ViewerItem["suggestions"]): ViewerItem => ({
  key: "p:0",
  place: { page: 1, slot: 0 },
  photo: null,
  choice: null,
  matches: [],
  suggestions,
  state: "unread",
  lookFor: "Zoro",
});

async function viewerHtml(item: ViewerItem): Promise<string> {
  const { CardViewer } = await import("@/components/cards/card-viewer");
  return renderToStaticMarkup(
    createElement(CardViewer, {
      label: rules.CHECK_PAGES,
      items: [item],
      at: 0,
      onAt: () => {},
      imagesEnabled: false,
      playerGames: [],
      onChoose: () => {},
      onConfirm: () => {},
      onClose: () => {},
    }),
  );
}

describe("the scan check finds a card with the Flare composer's picker", () => {
  it("is CardPicker itself, in one-card mode, not a search of its own", () => {
    expect(viewer).toContain(
      'import { CardPicker } from "@/components/flares/card-picker";',
    );
    expect(viewer).toContain("<CardPicker");
    expect(viewer).toContain("onPickOne={(card, printing) => {");
    expect(viewer).not.toContain("<CardSearch");
    expect(viewer).not.toContain("@/components/cards/card-search");
  });

  it("is presented as the composer presents it: its column, in a Card", () => {
    expect(composer).toMatch(
      /<Card className="flex flex-col gap-4 p-4 sm:p-6">\s*<CardPicker/,
    );
    expect(viewer).toMatch(
      /<Card className="flex flex-col gap-4 p-4 sm:p-6">\s*<CardPicker/,
    );
    expect(viewer).toContain("max-w-2xl");
  });

  it("chooses the tapped card for the pocket and closes the picker", () => {
    expect(viewer).toMatch(
      /onPickOne=\{\(card, printing\) => \{\s*onChoose\(\{ card, printingId: printing\?\.id \?\? null \}\);\s*setPicking\(false\);/,
    );
    expect(viewer).toContain("onDone={() => setPicking(false)}");
  });

  it("opens with the read name typed, and Find the card opens it", () => {
    expect(viewer).toContain("initialQuery={item.lookFor}");
    expect(check).toContain('lookFor: read ? read.englishName || read.name : "",');
    expect(viewer).toContain("onFind={() => setPicking(true)}");
    expect(viewer).toMatch(/onClick=\{onFind\}>\s*\{FIND_THE_CARD\}/);
  });

  it("does not step to another pocket from the picker", () => {
    expect(viewer).toContain("if (!steps || picking) return;");
  });
});

describe("CardPicker's one-card mode", () => {
  it("never counts: no badge, no minus, no tray, no Done", () => {
    const one = code(fn(picker, "PickOneCard"));
    expect(one).toContain("<CardSearch");
    expect(one).toContain("onSelect={onPickOne}");
    for (const counting of [
      "QuantityBadge",
      "markFor",
      "markForPrintingFor",
      "onUnpick",
      "onLess",
      "onAdd",
      "cards",
      '"Done"',
    ]) {
      expect(one, counting).not.toContain(counting);
    }
  });

  it("keeps the composer's header: the way out left of the title", () => {
    const one = fn(picker, "PickOneCard");
    expect(one).toContain('<div className="flex items-center gap-3 pr-8">');
    expect(one).toMatch(/<ArrowLeft className="size-4" aria-hidden="true" \/>\s*Back/);
    expect(one).toContain(
      '<h2 className="font-semibold text-text-primary">{title}</h2>',
    );
  });

  it("is chosen by onPickOne, and the composer never passes it", () => {
    expect(picker).toContain("if (props.onPickOne) {");
    expect(composer).not.toContain("onPickOne");
    expect(composer).toContain("cards={draft.cards}");
  });

  it("draws the read name in the field and no quantity tag", async () => {
    const { CardPicker } = await import("@/components/flares/card-picker");
    const html = renderToStaticMarkup(
      createElement(CardPicker, {
        imagesEnabled: false,
        playerGames: [],
        title: rules.FIND_THE_CARD,
        initialQuery: "Zoro",
        onPickOne: () => {},
        onDone: () => {},
      }),
    );
    expect(html).toContain('value="Zoro"');
    expect(html).toContain(rules.FIND_THE_CARD);
    expect(html).not.toContain("Nothing picked yet");
    expect(html).not.toContain("Picked cards");
    expect(html).not.toContain("×");
  });
});

describe("Might be one of these", () => {
  it("threads the server's suggestions from an unread pocket into the viewer", () => {
    expect(check).toContain(
      'suggestions: pocket.state === "unread" ? pocket.suggestions : undefined,',
    );
  });

  it("renders MIGHT_BE_THESE from the suggestions, over Find the card", () => {
    expect(viewer).toContain(
      'const suggestions = item.state === "unread" ? (item.suggestions ?? []) : [];',
    );
    expect(viewer).toMatch(
      /\{suggestions\.length > 0 && \([\s\S]*?word=\{MIGHT_BE_THESE\}[\s\S]*?guesses=\{suggestions\}/,
    );
    expect(viewer.indexOf("word={MIGHT_BE_THESE}")).toBeLessThan(
      viewer.indexOf("{/* The menu, in the app's order. */}"),
    );
    /* A tap chooses it, as a found pocket's other guesses do. */
    expect(viewer).toContain(
      "onPick={() => onPick({ card: match.card, printingId: match.printingId })}",
    );
  });

  it("shows each suggestion's name and number as a tappable tile", async () => {
    const html = await viewerHtml(
      unread([
        { card: card("a", "Roronoa Zoro", "OP06-118"), printingId: null },
        { card: card("b", "Zoro-Juurou", "OP06-047"), printingId: null },
      ]),
    );
    expect(html).toContain(rules.MIGHT_BE_THESE);
    expect(html).toContain('aria-label="Roronoa Zoro, OP06-118"');
    expect(html).toContain("OP06-047");
    expect(html.indexOf(rules.MIGHT_BE_THESE)).toBeLessThan(
      html.indexOf(rules.FIND_THE_CARD),
    );
  });

  it("leaves a pocket without suggestions as it was", async () => {
    for (const item of [unread(), unread([])]) {
      const html = await viewerHtml(item);
      expect(html).not.toContain(rules.MIGHT_BE_THESE);
      expect(html).toContain(">?</span>");
      expect(html).toContain(rules.FIND_THE_CARD);
    }
  });
});

describe("the queue's line wears the spinner until it is ready", () => {
  it("renders Spinner, small, on the right of the line, only while not ready", () => {
    expect(queues).toContain('import { Spinner } from "@/components/ui/spinner";');
    const line = queues.indexOf("{pagesWaitingLine(queue.pages, queue.ready)}");
    const spinner = queues.indexOf('{!queue.ready && <Spinner size="sm" />}');
    expect(line).toBeGreaterThan(-1);
    expect(spinner).toBeGreaterThan(line);
  });

  it("spins while the pages are read, and gives way to Check now", async () => {
    const { QueueBanners } = await import("@/components/binder/page-queues");
    const reading = renderToStaticMarkup(
      createElement(QueueBanners, {
        queues: [{ batchId: "b", pages: 5, ready: false }],
        onCheck: () => {},
      }),
    );
    expect(reading).toContain("Finding the cards on 5 pages");
    expect(reading).toContain("animate-spin");
    expect(reading).not.toContain(rules.CHECK_NOW);

    const ready = renderToStaticMarkup(
      createElement(QueueBanners, {
        queues: [{ batchId: "b", pages: 5, ready: true }],
        onCheck: () => {},
      }),
    );
    expect(ready).toContain("5 pages ready to check");
    expect(ready).not.toContain("animate-spin");
    expect(ready).toContain(rules.CHECK_NOW);
  });
});
