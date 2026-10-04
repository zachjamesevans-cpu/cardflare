import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(resolve(import.meta.dirname, "../..", path), "utf8");

/**
 * Binder round 2, the app's half: the grid is measured and three
 * across, and hold to move is one card in the air.
 *
 * The founder, with four phone screenshots: "The 2x2 and 3x3 are both
 * broken on phone... Just have a 3x3." and "The drag and drop thing
 * in the binder is awful and broken."
 *
 * The pockets drew two to a row because the page frame's width was
 * taken from the window and its 1pt border was drawn on top of the
 * arithmetic: three pockets plus two gaps were exactly the frame's
 * padding box, 2pt more than the content box inside the border, and
 * the third pocket wrapped. These pins hold the fix: the width is
 * measured, the border is inside PAGE_PAD, the pocket is floored.
 *
 * Round 3 took the buttons off the page: no Add cards button, no Edit
 * mode, a card leaves by being dropped on Remove, and the settings
 * are a sheet behind a pencil in the header.
 */

const page = read("mobile/src/screens/binder.tsx");
/* The page frame, the pocket, the "+" pocket and the dots: shared with
   the hunt page since "Hunts drawn like binders", so the grid's
   arithmetic is pinned where it lives. */
const pockets = read("mobile/src/pockets.tsx");
const covers = read("mobile/src/binder-covers.ts");
const api = read("mobile/src/api.ts");
const cover = read("mobile/src/binder-cover.tsx");
const highlights = read("mobile/src/binder-highlights.tsx");
const list = read("mobile/src/binder-list.tsx");
const create = read("mobile/src/create-binder-sheet.tsx");

/* The numbers as the theme has them: spacing(n) = n * 4. */
const PAGE_PAD = 12;
const POCKET_GAP = 8;
const PAGE_BORDER = 1;

describe("the binder grid on the phone", () => {
  it("measures the page frame rather than reading the window", () => {
    expect(page).toContain("onLayout={onFrameLayout}");
    expect(page).toContain("event.nativeEvent.layout.width");
    expect(page).not.toContain("useWindowDimensions");
    expect(page).not.toContain("window.width");
  });

  it("gives every pocket a third of what is inside the frame, floored", () => {
    expect(pockets).toContain(
      "Math.floor((pageWidth - 2 * PAGE_PAD - 2 * POCKET_GAP) / 3)",
    );
    expect(pockets).toContain("export const PAGE_PAD = spacing(3);");
    expect(pockets).toContain("export const POCKET_GAP = spacing(2);");
    expect(pockets).toContain("export const PAGE_BORDER = 1;");
    /* The border is part of the pad, so the measured width is what is divided. */
    expect(pockets).toContain("padding: PAGE_PAD - PAGE_BORDER,");
    expect(pockets).toContain("borderWidth: PAGE_BORDER,");
    /* The binder draws that frame and those pockets, never its own. */
    expect(page).toContain('} from "../pockets";');
    expect(page).toContain("<PageFrame geometry={geometry}>");
    expect(page).not.toContain("PAGE_BORDER");
    /* The pocket is exactly its width and clips whatever is inside it;
       the picture is told the width inside the ring. */
    expect(page).toContain("width={width - 2 * POCKET_RING}");
    expect(pockets).toMatch(
      /width,\s+height,\s+borderRadius: 5,[\s\S]{0,400}overflow: "hidden"/,
    );
  });

  it("fits three pockets on every phone width, which the old sum did not", () => {
    for (let pageWidth = 300; pageWidth <= 500; pageWidth += 1) {
      const pocket = Math.floor((pageWidth - 2 * PAGE_PAD - 2 * POCKET_GAP) / 3);
      const row = 3 * pocket + 2 * POCKET_GAP;
      /* What the pockets have: the frame minus the pad on each side,
         the border being inside the pad. */
      expect(row, `${pageWidth}pt page`).toBeLessThanOrEqual(pageWidth - 2 * PAGE_PAD);
      expect(pocket, `${pageWidth}pt page`).toBeGreaterThan(0);
      /* The old build: an unfloored third, and a border outside the pad. */
      const oldRow =
        3 * ((pageWidth - 2 * PAGE_PAD - 2 * POCKET_GAP) / 3) + 2 * POCKET_GAP;
      const oldInside = pageWidth - 2 * PAGE_PAD - 2 * PAGE_BORDER;
      expect(oldRow, `${pageWidth}pt page, old sum`).toBeGreaterThan(oldInside);
    }
  });

  it("is three by three and nothing else", () => {
    expect(covers).toContain("export const BINDER_LAYOUT = 3;");
    expect(covers).toContain(
      "export const POCKETS_PER_PAGE = BINDER_LAYOUT * BINDER_LAYOUT;",
    );
    expect(covers).not.toContain("BINDER_LAYOUTS");
    expect(page).toContain("POCKETS_PER_PAGE");
    for (const gone of [
      "2 × 2",
      "3 × 3",
      "BINDER_LAYOUTS",
      "pocketsPerPage(",
      "layout === 2",
    ]) {
      expect(page, gone).not.toContain(gone);
    }
    /* No Layout heading in the settings strip. */
    expect(page).not.toMatch(/>\s*Layout\s*</);
    expect(api).toContain("layout: 3;");
  });
});

describe("hold to move on the phone", () => {
  it("lifts only the held card, as an overlay on a long press", () => {
    expect(page).toContain("onLongPress={yours ? onPickUp : undefined}");
    expect(page).toContain("function HeldPocket(");
    expect(page).toContain("const LIFT_SCALE = 0.05;");
    expect(page).toContain("scale: 1 + LIFT_SCALE * lift.value");
    expect(page).toContain("shadowOpacity: 0.5 * lift.value");
  });

  it("leaves a dashed outline behind and rings the pocket under the finger", () => {
    expect(pockets).toContain('borderStyle: placeholder ? "dashed" : "solid"');
    expect(pockets).toContain("borderColor: targeted\n          ? colors.accent");
    expect(page).toContain("placeholder={placeholder}");
    expect(page).toContain("targeted={targeted}");
    expect(page).toContain("targeted={target === index}");
  });

  it("commits on release with a layout animation, then writes the order", () => {
    expect(page).toContain("LayoutAnimation.configureNext(");
    expect(page).toContain("LayoutAnimation.Types.easeInEaseOut");
    expect(page).toContain("onMoveRef.current(from.index, toIndex)");
    expect(page).toContain("reorderBinder(");
    expect(page).toContain("void load();");
  });

  it("takes a card out by dropping it on Remove, and has no Edit mode", () => {
    /* Round 3. The founder: "the add cards button and edit button are
       completely redundant because you should be able to do both of
       those on that screen already. Delete." */
    for (const gone of [
      "editing",
      "setEditing",
      '"Done"',
      'label="Add cards"',
      'label="Edit"',
      "from your binder",
    ]) {
      expect(page, gone).not.toContain(gone);
    }
    /* The zone: under the page frame, only while a card is in hand,
       dashed in the danger colour, the word Remove in it. */
    expect(page).toContain("function RemoveZone(");
    expect(page).toMatch(/\{drag\.held \? \(\s*<RemoveZone/);
    expect(page).toContain('accessibilityLabel="Remove from binder"');
    expect(page).toContain("borderColor: colors.danger");
    expect(page).toMatch(/borderStyle: over \? "solid" : "dashed"/);
    expect(page).toMatch(/>\s*Remove\s*</);
    /* Measured with onLayout against the frame's parent, and read in
       the frame's coordinates, the same ones the finger is tracked in. */
    expect(page).toContain("onLayout={onLayout}");
    expect(page).toContain("onRemoveZoneLayout");
    expect(page).toContain("frameRef.current = event.nativeEvent.layout");
    expect(page).toContain("zoneRef.current = event.nativeEvent.layout");
    expect(page).toContain("const left = zone.x - frame.x;");
    expect(page).toContain("const top = zone.y - frame.y;");
    /* On release over it: onRemove, not onMove, and the overlay fades
       rather than gliding home. */
    expect(page).toContain("if (overRemoveRef.current) {");
    expect(page).toContain("onRemoveRef.current(from.index)");
    expect(page).toContain("presence.value = withTiming(0, DROP");
    expect(page).toContain("opacity: presence.value");
    expect(page).toContain("removeBinderCard(card.entryId, id)");
    /* The hint, word for word with the website, only once there is a card. */
    expect(page).toContain("Hold a card to move it, or drop it on Remove.");
    expect(page).toContain("Cards you would trade. Add the ones you carry.");
    expect(page).toMatch(
      /binder\.count === 0 \? \(\s*<Muted>Cards you would trade\. Add the ones you carry\.<\/Muted>\s*\) : \(\s*<Text style=\{\{ color: colors\.textMuted, fontSize: 12 \}\}>\s*Hold a card to move it, or drop it on Remove\./,
    );
  });

  it("moves nothing else, and never turns the page in hand", () => {
    for (const gone of [
      "watchEdge",
      "turnHeld",
      "wobble",
      "withRepeat",
      "EDGE_HOLD_MS",
      "DEAD_ZONE",
      "slot.value",
      "from.value",
      "neutralFor",
    ]) {
      expect(page, gone).not.toContain(gone);
    }
    /* A pocket is a plain View: no animated transform on a neighbour.
       The shared pocket is the view; the binder's wrapper puts the
       card in it. Neither animates. */
    const pocket = pockets.slice(
      pockets.indexOf("export function Pocket("),
      pockets.indexOf("export function EmptyPocket("),
    );
    expect(pocket.length).toBeGreaterThan(0);
    expect(pocket).not.toContain("useAnimatedStyle");
    expect(pocket).not.toContain("transform");
    expect(pocket).toContain("<View");
    const wrapper = page.slice(
      page.indexOf("function BinderPocket("),
      page.indexOf("function RemoveZone("),
    );
    expect(wrapper.length).toBeGreaterThan(0);
    expect(wrapper).not.toContain("useAnimatedStyle");
    expect(wrapper).not.toContain("transform");
    expect(wrapper).toContain("<Pocket");
    expect(page).toContain("scrollEnabled={!drag.held}");
  });
});

describe("the binder's model in the app", () => {
  it("has the one switch and no kind, no front card, no picture", () => {
    expect(api).toContain("forTrade: boolean;");
    expect(api).toContain("forTrade?: boolean;");
    for (const gone of [
      "kind: BinderKind",
      "BinderKind",
      "frontImageUrl",
      "frontEntryId",
      "TRADE_BINDER_ID",
      "layout?:",
    ]) {
      expect(api, gone).not.toContain(gone);
    }
    expect(api).toContain(
      "export const getBinder = (playerId: string | undefined, binderId: string)",
    );
    expect(api).toContain(
      "export const saveBinder = (patch: BinderSettingsPatch, binderId: string)",
    );
    expect(cover).not.toContain("RemoteImage");
    expect(cover).not.toContain("frontImageUrl");
    expect(cover).toContain("label?: string | null;");
    expect(highlights).not.toContain("RemoteImage");
    expect(highlights).toContain(
      '<BinderCover cover={binder.cover} size="xs" plain />',
    );
    expect(highlights).toContain("binder.forTrade");
    expect(list).toContain("Up for trade");
    expect(list).toContain(">Private<");
    expect(list).not.toContain("kind");
    expect(create).toContain("Up for trade");
    expect(create).toContain("createBinder({ name: trimmed, cover, forTrade })");
    expect(create).toContain(
      'export const FOR_TRADE_LINE = "People nearby hunting one of these cards hear about it.";',
    );
  });

  it("keeps its settings in a sheet behind a pencil in the header", () => {
    /* Round 3. The founder: "having the binder edit screen be all the
       way at the bottom is kinda meh. Maybe a small edit icon at the
       top or something." The pencil is the website's, in the header
       the app already names, and opens the same sheet. */
    expect(page).toMatch(
      /navigation\.setOptions\(\{\s*title: binderTitle\(binder\),\s*headerRight:/,
    );
    expect(page).toContain('accessibilityLabel="Binder settings"');
    expect(page).toContain('name="pencil-outline"');
    expect(page).toMatch(
      /<Ionicons\s+name="pencil-outline"\s+size=\{22\}\s+color=\{colors\.textPrimary\}/,
    );
    expect(page).toContain("function BinderSettingsSheet(");
    expect(page).toContain("<SheetBackdrop />");
    expect(page).toMatch(/>\s*Binder settings\s*</);
    expect(page).toContain(
      "<BinderSettings binder={binder} onSave={onSave} onDelete={onDelete} />",
    );
    /* The settings keep saving at once: no Save button in the sheet. */
    const sheet = page.slice(
      page.indexOf("function BinderSettingsSheet("),
      page.indexOf("function DeleteBinderConfirm("),
    );
    expect(sheet.length).toBeGreaterThan(0);
    expect(sheet).not.toContain('label="Save"');
    expect(sheet).toContain("Delete binder");
    /* No settings strip in the page body any more: the page's own
       owner block is the hint, the empty line and the error. */
    const body = page.slice(
      page.indexOf("<PageDots"),
      page.indexOf("</ScrollView>", page.indexOf("<PageDots")),
    );
    expect(body).not.toContain("<BinderSettings");
    expect(body).not.toContain("<Button");
  });

  it("says what the switch means under the title, and deletes any binder", () => {
    expect(page).toContain(
      "Up for trade. Somebody nearby hunting one of these hears about it.",
    );
    expect(page).toContain("`Cards ${binder.ownerName} will trade.`");
    expect(page).toContain("Private. Only you can open it.");
    expect(page).toContain("Delete binder");
    expect(page).toContain("deleteBinder(");
    expect(page).not.toContain('kind === "custom"');
    expect(page).toContain("onSave({ forTrade: next })");
    /* The switch writes forTrade; isPublic is only read back as the same fact. */
    expect(page).not.toContain("isPublic: !");
    expect(page).not.toContain("onSave({ isPublic");
  });
});
