import { useEffect, useState } from "react";
import { Text, View } from "react-native";

import { getNightBinders, type NightBinderState } from "./api";
import { BinderCover } from "./binder-cover";
import { BringingSheet, onBringingSaved } from "./bringing-sheet";
import { BRINGING_EDIT, bringingLine, yourBindersTitle } from "./night-binder-copy";
import { colors, radius, spacing } from "./theme";
import { Tap } from "./ui";

/** The button with nothing picked yet. */
export const PICK_BINDERS = "Pick binders";

/** How many covers the stack shows before "+N". */
const STACK = 3;

/**
 * Your binders for tonight: the website's your-binders.tsx, the
 * night's own row for a player who is going, "2 binders selected · 47
 * cards" with the picked covers fanned beside it, and Edit to open the
 * picker again.
 *
 * The founder (2026-10-09): "On the Night detail screen, display
 * something like: Your Binders for Tonight '2 binders selected · 47
 * cards'. Allow them to tap to view or edit." Drawn only while the
 * night still takes changes and the server has the player going;
 * nothing at all until the first read lands, so the page does not
 * jump. With nothing picked the line is the nudge and the button says
 * Pick binders. The whole row is the tap, a phone's habit; the button
 * is where the eye goes.
 *
 * It reads its own state, again whenever `reloadOn` changes (the room
 * hands it the night's matches, which are re-read on a pull and on
 * Going), and repaints from any sheet's save, the one after Going
 * included. `onChanged` is told after a save here, so the room can
 * re-read its matches.
 */
export function YourBinders({
  eventId,
  reloadOn,
  onChanged,
}: {
  eventId: string;
  reloadOn?: unknown;
  onChanged?: () => void;
}) {
  const [state, setState] = useState<NightBinderState | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let live = true;
    getNightBinders(eventId)
      .then(({ state: fresh }) => {
        if (live) setState(fresh);
      })
      .catch(() => {
        /* Garnish on the night; the room must not fail over it. */
      });
    return () => {
      live = false;
    };
  }, [eventId, reloadOn]);

  useEffect(
    () =>
      onBringingSaved((savedFor, fresh) => {
        if (savedFor === eventId) setState(fresh);
      }),
    [eventId],
  );

  if (!state || !state.editable || !state.going) return null;

  const picked = state.binders.filter((binder) => binder.selected);
  const shown = picked.slice(0, STACK);
  const more = picked.length - shown.length;
  const title = yourBindersTitle(state.dayWord);
  const line = bringingLine(state.selectedCount, state.selectedCards);
  const any = state.selectedCount > 0;

  return (
    <>
      <Tap
        onPress={() => setOpen(true)}
        accessibilityLabel={`${title}. ${line}. ${any ? BRINGING_EDIT : PICK_BINDERS}`}
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: spacing(3),
          borderRadius: radius.card,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.surface,
          padding: spacing(3),
        }}
      >
        {shown.length > 0 ? (
          <View style={{ flexDirection: "row", alignItems: "flex-end", flexShrink: 0 }}>
            {shown.map((binder, index) => (
              <View key={binder.id} style={{ marginLeft: index > 0 ? -28 : 0 }}>
                <BinderCover cover={binder.cover} label={binder.name} size="xs" />
              </View>
            ))}
            {more > 0 ? (
              <View
                style={{
                  marginLeft: -12,
                  minWidth: 24,
                  height: 24,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: colors.border,
                  backgroundColor: colors.elevated,
                  paddingHorizontal: spacing(1.5),
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text
                  maxFontSizeMultiplier={1.3}
                  style={{
                    color: colors.textSecondary,
                    fontSize: 11,
                    fontWeight: "600",
                  }}
                >
                  {`+${more}`}
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}

        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Text style={{ color: colors.textPrimary, fontSize: 14, fontWeight: "600" }}>
            {title}
          </Text>
          <Text style={{ color: colors.textSecondary, fontSize: 12 }}>{line}</Text>
        </View>

        {/* Drawn as the button; the row around it takes the tap. */}
        <View
          style={{
            borderRadius: radius.control,
            borderWidth: 1,
            borderColor: any ? colors.border : colors.accent,
            backgroundColor: any ? colors.elevated : colors.accent,
            paddingHorizontal: spacing(3),
            paddingVertical: spacing(1.5),
          }}
        >
          <Text
            style={{
              color: any ? colors.textPrimary : colors.accentContrast,
              fontSize: 13,
              fontWeight: "700",
            }}
          >
            {any ? BRINGING_EDIT : PICK_BINDERS}
          </Text>
        </View>
      </Tap>

      {open ? (
        <BringingSheet
          eventId={eventId}
          state={state}
          onClose={() => setOpen(false)}
          onSaved={() => onChanged?.()}
        />
      ) : null}
    </>
  );
}
