import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Binder round 3, the website's binder.
 *
 * The founder: "Binder should bring up same menu as posting flares -
 * can select multiple of one card, etc, to put into binder at mass."
 * "Share button shouldn't be in same bubble as edit." "I should be able
 * to hold it down, and without lifting finger start moving the cards
 * around." "Adding a card in a specific slot should put that exact card
 * there." The app's twin is pinned in binder3-app.test.ts.
 */

const read = (path: string) =>
  readFileSync(resolve(import.meta.dirname, "../..", path), "utf8");

const view = read("src/components/binder/binder-page.tsx");
const add = read("src/components/binder/add-binder-card.tsx");
const picker = read("src/components/binder/binder-picker.tsx");
const paste = read("src/components/binder/paste-list.tsx");
const drag = read("src/components/binder/pocket-drag.ts");
const pockets = read("src/components/binder/pockets.tsx");
const search = read("src/components/cards/card-search.tsx");
const flarePicker = read("src/components/flares/card-picker.tsx");
const composer = read("src/components/flares/flare-composer.tsx");

/** The part of a file from `start` to the next top-level declaration. */
function fn(source: string, name: string): string {
  const start = source.search(new RegExp(`function ${name}\\b`));
  expect(start, `${name} exists`).toBeGreaterThanOrEqual(0);
  const rest = source.slice(start + 1);
  const end = rest.search(/\n(?:export )?(?:function|const|type|interface) /);
  return source.slice(start, end === -1 ? undefined : start + 1 + end);
}

describe("the add menu is the Flare picker, adapted", () => {
  it("picks with the composer's own draft rules and the site's search", () => {
    expect(add).toContain("<BinderPicker");
    expect(add).toContain("setPicks((current) => addCard(current, card, printing))");
    expect(add).toContain("setPicks((current) => lessCard(current, key))");
    expect(picker).toContain("<CardSearch");
    expect(picker).toContain("onSelect={onAdd}");
    expect(picker).toContain(
      "onUnpick={(card, printing) => onLess(lineKey(card.id, printing?.id ?? null))}",
    );
    /* The tag goes where the tap went, as in the Flare picker. */
    expect(picker).toContain("keyOf(item) === lineKey(card.id, null)");
    expect(picker).toContain("keyOf(item) === lineKey(card.id, printing.id)");
  });

  it('marks a picked result with the quantity tag, "×1" included, in both pickers', () => {
    const badge = read("src/components/ui/quantity-badge.tsx");
    expect(badge).toContain("always = false,");
    expect(badge).toContain("if (quantity === 1 && !always) return null;");
    expect(search).toContain(
      '<QuantityBadge quantity={mark} size="md" always className="shrink-0" />',
    );
    expect(search).toContain("markFor?: (card: CardResult) => number | null;");
    expect(picker).toContain("return line ? line.quantity : null;");
    expect(flarePicker).toContain("return line ? markCount(line.quantity) : null;");
    expect(search).not.toContain("border-accent bg-accent px-2 py-0.5 text-[11px]");
  });

  it("counts copies with a stepper and tags the tray with QuantityBadge", () => {
    expect(picker).toContain("<Stepper");
    expect(picker).toContain("max={MAX_COPIES}");
    expect(picker).toMatch(/<QuantityBadge\s+quantity=\{item\.quantity\}/);
    expect(picker).toContain('aria-label="Picked cards"');
  });

  it('says "×2 in this binder" or "In this binder" on a result already filed', () => {
    const line = fn(picker, "InThisBinder");
    expect(line).toContain("if (copies <= 0) return null;");
    expect(line).toContain('<QuantityBadge quantity={copies} size="md" />');
    expect(line).toContain("in this binder");
    expect(line).toContain('"In this binder"');
    expect(picker).toContain(
      "noteFor={(card) => <InThisBinder copies={inBinder.get(card.id) ?? 0} />}",
    );
    /* CardSearch draws the caller's line, and only when asked. */
    expect(search).toContain("noteFor?: (card: CardResult) => React.ReactNode;");
    expect(search).toContain("note={noteFor ? noteFor(card) : null}");
    /* Copies per card, across printings, from the binder's own cards. */
    expect(add).toContain(
      "copies.set(card.cardId, (copies.get(card.cardId) ?? 0) + card.quantity);",
    );
    expect(view).toContain("inBinder={cards}");
  });

  it('adds the whole tray at once, "Add 5 cards to binder", counting distinct cards', () => {
    const label = fn(add, "addLabel");
    expect(label).toContain('if (count === 0) return "Add cards to binder";');
    expect(label).toContain(
      '`Add ${count} ${count === 1 ? "card" : "cards"} to binder`',
    );
    expect(add).toContain("const count = items.length;");
    expect(add).toContain("{addLabel(count)}");
    expect(add).toContain(
      "const result = await addBinderCardsAction(binderId, { items, pocket });",
    );
    /* The action's own sentence reaches the page. */
    expect(add).toContain("onAdded?.(result.message, result.firstPocket);");
    expect(view).toContain("setAdded(message);");
    expect(view).toContain(
      "if (firstPocket !== null) setAt(Math.floor(firstPocket / perPage));",
    );
  });

  it("starts the batch AT the tapped pocket", () => {
    expect(view).toMatch(
      /<AddPocket\s+onClick=\{\(\) => setAdding\(\{ pocket: slot \}\)\}/,
    );
    expect(view).toContain("pocket={adding?.pocket ?? null}");
    expect(add).toContain("pocket = null,");
  });
});

describe("Paste a list, in the same menu", () => {
  it("is a tab beside the search", () => {
    expect(add).toContain('["search", "Search"]');
    expect(add).toContain('["paste", "Paste a list"]');
    expect(add).toContain('role="tablist"');
    expect(add).toContain("<PasteList");
  });

  it("looks the list up first, with the placeholder the founder's lists look like", () => {
    expect(paste).toContain(
      'export const LIST_PLACEHOLDER = "2x OP01-001\\nOP05-119\\n...";',
    );
    expect(paste).toContain("placeholder={LIST_PLACEHOLDER}");
    expect(paste).toMatch(/>\s*Look up\s*</);
    expect(add).toContain("const result = await previewBinderListAction(text);");
  });

  it("confirms with art, names, QuantityBadge and steppers, and lists what it left out", () => {
    expect(paste).toMatch(/<QuantityBadge\s+quantity=\{entry\.quantity\}/);
    expect(paste).toContain("<Stepper");
    expect(paste).toContain("Not found: ");
    expect(paste).toContain(`{"Couldn't read: "}`);
    expect(paste).toContain("preview.unreadable.map(");
    /* Only the cards it found are added, any printing, same pocket rule. */
    expect(add).toContain(
      "? [{ cardId: entry.cardId, printingId: null, quantity: entry.quantity }]",
    );
  });
});

describe("real pockets", () => {
  it("draws each page from the shared pocket maths, gaps kept", () => {
    expect(view).toContain('from "@/lib/binder/pocket-math"');
    expect(view).toContain("const pages = pagesFor(list, binder.yours);");
    expect(view).toContain("const pockets = pageOf(drawn, page);");
    expect(view).not.toContain("list.slice(page * perPage");
  });
});

describe("hold and move, in one gesture", () => {
  it("lifts on a held finger, or a moving mouse, with pointer events", () => {
    expect(drag).toContain("export const LIFT_MS = 300;");
    expect(drag).toContain(
      "if (now.touch) now.liftTimer = setTimeout(() => lift(now), LIFT_MS);",
    );
    expect(drag).toContain("} else if (moved > MOUSE_SLOP) {");
    expect(drag).toContain('window.addEventListener("pointermove", onMove);');
    expect(drag).toContain(
      'window.addEventListener("touchmove", onTouchMove, { passive: false });',
    );
    expect(drag).toContain(
      "if (now.lifted && touch.cancelable) touch.preventDefault();",
    );
    expect(drag).toContain("navigator.vibrate(12);");
    /* No HTML5 drag and drop: a phone's browser will not start one. */
    expect(view).not.toContain("draggable=");
    expect(view).not.toContain("dataTransfer");
    expect(pockets).not.toContain("onDragOver");
  });

  it("draws the card in the hand bigger, with a shadow, under the finger", () => {
    expect(drag).toContain("scale(1.08)");
    expect(view).toContain("shadow-[var(--shadow-panel)]");
    expect(view).toContain("createPortal(");
    expect(view).toContain("ref={ghost}");
  });

  it("slides the others aside as placeInPockets says, while hovering", () => {
    expect(view).toContain(
      "dragging && landing !== null ? placeInPockets(list, dragging, landing) : list;",
    );
    expect(drag).toContain("export function useSlide(");
    expect(drag).toContain("prefers-reduced-motion: reduce");
    expect(view).toContain("ref={card ? slide(card.entryId) : undefined}");
  });

  it("turns the page when held at an edge or over an arrow", () => {
    expect(drag).toContain("export const TURN_MS = 600;");
    expect(drag).toContain("latest.current.onTurn(side);");
    expect(pockets).toContain("data-drop={side}");
    expect(view).toContain(
      'canTurn: (side) => (side === "prev" ? page > 0 : page < pages - 1),',
    );
  });

  it("drops optimistically, then places on the server, and puts it back on failure", () => {
    const move = view.slice(
      view.indexOf("const move = (entryId: string, pocket: number)"),
    );
    expect(move).toContain("const before = cards;");
    expect(move).toContain("setCards(placeInPockets(cards, entryId, pocket));");
    expect(move).toContain(
      "await placeBinderCardAction(binder.id, { entryId, pocket });",
    );
    expect(move).toContain("setCards(before);");
    expect(move).toContain("It is back where it was.");
    expect(view).not.toContain("reorderBinderAction");
  });

  it("keeps Remove and the keyboard, pocket by pocket", () => {
    expect(view).toContain('if (spot === "remove") remove(entryId);');
    expect(view).toContain('data-drop="remove"');
    expect(view).toContain("move(card.entryId, card.pocket + step);");
    expect(view).toContain("hold Alt and use the arrow keys");
  });

  it("does not open the viewer on the release that ends a drag", () => {
    expect(drag).toContain(
      'window.addEventListener("click", swallow, { capture: true, once: true });',
    );
  });
});

describe("Share, its own round button", () => {
  const share = fn(view, "ShareBinder");

  it("is its own button, separate from the pencil, for owner and visitor", () => {
    expect(share).toContain('aria-label="Share binder"');
    /* The header's plain icon box, no circle: "remove all of these
       weird 'bubbles' around icons". */
    expect(share).toContain("className={HEADER_BUTTON}");
    expect(view).toContain('aria-label="Binder settings"');
    expect(view).toContain("{(binder.yours || settings.forTrade) && (");
  });

  it("hands out the short link, and keeps the private line and Link copied", () => {
    expect(share).toContain(
      "const url = `${window.location.origin}/b/${shareCode ?? binderId}`;",
    );
    expect(share).toContain('{copied ? "Link copied" : ""}');
    expect(view).toContain("{PRIVATE_SHARE_LINE}");
  });
});

describe("one quantity tag in the pickers", () => {
  it("tags the Flare picker's tray and the composer's strip with QuantityBadge", () => {
    for (const [name, source] of [
      ["picker", flarePicker],
      ["composer", composer],
    ] as const) {
      expect(source, name).toContain(
        'import { QuantityBadge } from "@/components/ui/quantity-badge";',
      );
      expect(source, name).toMatch(/<QuantityBadge\s+quantity=\{item\.quantity\}/);
      expect(source, name).not.toContain(
        "{item.quantity > 1 && ` · ${item.quantity}`}",
      );
    }
  });
});
