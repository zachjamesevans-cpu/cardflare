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

describe("hold and drag on the phone, in one touch", () => {
  /* Binder round 3. The founder: "Drag and drop isn't perfect - you
     have to hold it down to go into edit mode, then press it again. I
     should be able to hold it down, and without lifting finger start
     moving the cards around." */
  it("is one gesture-handler pan on the page frame, activating after a hold", () => {
    expect(page).toContain(
      'import { Gesture, GestureDetector } from "react-native-gesture-handler";',
    );
    expect(page).toContain("const HOLD_MS = 300;");
    expect(page).toContain("Gesture.Pan()");
    expect(page).toContain(".activateAfterLongPress(HOLD_MS)");
    expect(page).toContain(".enabled(enabled)");
    expect(page).toContain("enabled: yours,");
    expect(page).toMatch(
      /<GestureDetector gesture=\{drag\.gesture\}>\s*<View onLayout=\{onFrameLayout\}/,
    );
    /* No PanResponder, no long press handed to the picture, no second press. */
    for (const gone of [
      "PanResponder",
      "onLongPress",
      "handlersFor",
      "grantedRef",
      "onTouchEnd",
      "useHoldToMove",
    ]) {
      expect(page, gone).not.toContain(gone);
    }
  });

  it("lifts the card with a haptic, larger, with a shadow, under the finger", () => {
    expect(page).toContain("Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)");
    expect(page).toContain("function HeldPocket(");
    expect(page).toContain("const LIFT_SCALE = 0.08;");
    expect(page).toContain("scale: 1 + LIFT_SCALE * lift.value");
    expect(page).toContain("shadowOpacity: 0.5 * lift.value");
    /* The worklet moves the overlay; decisions go to JS. */
    expect(page).toContain("dragX.value = event.translationX;");
    expect(page).toContain("runOnJS(onMove)(event.x, event.y);");
    expect(page).toContain("runOnJS(onPickUp)(event.x, event.y);");
    expect(page).toContain("runOnJS(onRelease)();");
    expect(page).toContain("scrollEnabled={!drag.held}");
  });

  it("slides the others as placeInPockets says while hovering", () => {
    expect(page).toContain('from "../pocket-math";');
    expect(page).toContain(
      "? placeInPockets(allCards, drag.held.entryId, drag.target)",
    );
    expect(page).toContain("slots={pageOf(shown, index)}");
    expect(page).toContain("const SLIDE = LinearTransition.duration(DROP.duration);");
    expect(page).toContain("layout={SLIDE}");
    /* The held card's place is the dashed outline, ringed where it lands. */
    expect(pockets).toContain('borderStyle: placeholder ? "dashed" : "solid"');
    expect(pockets).toContain("borderColor: targeted\n          ? colors.accent");
    expect(page).toContain("placeholder={placeholder}");
    expect(page).toContain("targeted={placeholder && landing}");
  });

  it("turns the page when the held card rests at an edge", () => {
    expect(page).toContain("const EDGE_TURN_MS = 600;");
    expect(page).toContain("const watchEdge = (fingerX: number, fingerY: number)");
    expect(page).toContain("edgeTimer.current = setTimeout(turn, EDGE_TURN_MS);");
    expect(page).toContain("live.current.onTurn(next);");
  });

  it("drops optimistically, PATCHes the pocket, and puts it back on a refusal", () => {
    expect(page).toContain("const next = placeInPockets(before, entryId, pocket);");
    expect(page).toContain(
      "const result = await placeBinderCard(writeId, entryId, pocket);",
    );
    expect(page).toContain(
      "setBinder((current) => (current ? { ...current, cards: before } : current));",
    );
    expect(page).toContain('"That card did not move."');
    expect(page).toContain("live.current.onPlace(from.entryId, to);");
    expect(page).not.toContain("reorderBinder");
    expect(api).toContain("export const placeBinderCard = (");
    expect(api).toContain(
      'call<{ binder: Binder }>("PATCH", `${binderPath(binderId)}/cards`',
    );
  });

  it("takes a card out by dropping it on Remove, and has no Edit mode", () => {
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
    expect(page).toContain("function RemoveZone(");
    expect(page).toMatch(/\{drag\.held \? \(\s*<RemoveZone/);
    expect(page).toContain('accessibilityLabel="Remove from binder"');
    expect(page).toContain("borderColor: colors.danger");
    expect(page).toMatch(/borderStyle: over \? "solid" : "dashed"/);
    expect(page).toMatch(/>\s*Remove\s*</);
    expect(page).toContain("onLayout={onLayout}");
    expect(page).toContain("onRemoveZoneLayout");
    expect(page).toContain("frameRef.current = event.nativeEvent.layout");
    expect(page).toContain("zoneRef.current = event.nativeEvent.layout");
    expect(page).toContain("const left = zone.x - frame.x;");
    expect(page).toContain("const top = zone.y - frame.y;");
    expect(page).toContain("if (overRemoveRef.current) {");
    expect(page).toContain("live.current.onRemove(from.entryId);");
    expect(page).toContain("presence.value = withTiming(0, DROP");
    expect(page).toContain("opacity: presence.value");
    expect(page).toContain("removeBinderCard(entryId, writeId)");
    expect(page).toContain("Hold a card to move it, or drop it on Remove.");
    expect(page).toContain("Cards you would trade. Add the ones you carry.");
    expect(page).toMatch(
      /binder\.count === 0 \? \(\s*<Muted>Cards you would trade\. Add the ones you carry\.<\/Muted>\s*\) : \(\s*<Text style=\{\{ color: colors\.textMuted, fontSize: 12 \}\}>\s*Hold a card to move it, or drop it on Remove\./,
    );
  });

  it("keeps the pocket a plain view: the slide is the wrapper's layout", () => {
    const pocket = pockets.slice(
      pockets.indexOf("export function Pocket("),
      pockets.indexOf("export function EmptyPocket("),
    );
    expect(pocket.length).toBeGreaterThan(0);
    expect(pocket).not.toContain("useAnimatedStyle");
    expect(pocket).not.toContain("transform");
    expect(pocket).not.toContain("handlers");
    const wrapper = page.slice(
      page.indexOf("function BinderPocket("),
      page.indexOf("function RemoveZone("),
    );
    expect(wrapper.length).toBeGreaterThan(0);
    expect(wrapper).not.toContain("useAnimatedStyle");
    expect(wrapper).toContain("<Pocket");
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
