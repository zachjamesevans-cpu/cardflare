import { Ionicons } from "@expo/vector-icons";
import { useState, type ReactNode } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { SheetBackdrop } from "./action-menu";
import type { Hunt } from "./api";
import { SwipeToClose } from "./sheet-swipe";
import { colors, radius, spacing } from "./theme";
import { Button, CardImage, Input, Muted, Tap } from "./ui";

/**
 * The composer's two choices that used to scroll sideways - the
 * printing, and the hunt - as a row that says what is chosen and a
 * sheet that lists the options DOWN, the way the rest of the app picks.
 * The founder: "it feels weird to scroll left when everywhere else on
 * the app you scroll down to change printing ... the 'add to a hunt'
 * thing at bottom is very weirdly placed." The website's composer draws
 * the same rows and sheets (src/components/flares/composer-sheets.tsx).
 */

/** "Printing   EB-02 · L ›": a choice and where it stands, one tap from the list. */
export function PickerRow({
  label,
  value,
  onPress,
  icon,
}: {
  label: string;
  value: string;
  onPress: () => void;
  icon?: React.ComponentProps<typeof Ionicons>["name"];
}) {
  return (
    <Tap
      accessibilityLabel={`${label}, ${value}. Change it`}
      onPress={onPress}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: spacing(2.5),
        borderRadius: radius.control,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.elevated,
        paddingHorizontal: spacing(3),
        paddingVertical: spacing(2.5),
      }}
    >
      {icon ? <Ionicons name={icon} size={18} color={colors.accent} /> : null}
      <Text style={{ color: colors.textSecondary, fontSize: 14 }}>{label}</Text>
      <Text
        numberOfLines={1}
        style={{
          flex: 1,
          textAlign: "right",
          color: colors.textPrimary,
          fontSize: 14,
          fontWeight: "600",
        }}
      >
        {value}
      </Text>
      <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
    </Tap>
  );
}

/** The sheet both choices open: a title, and the options, down. */
function PickerSheet({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <SheetBackdrop />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <Pressable onPress={onClose} style={{ flex: 1, justifyContent: "flex-end" }}>
          <SwipeToClose
            onClose={onClose}
            style={{
              backgroundColor: colors.surface,
              borderTopLeftRadius: radius.panel,
              borderTopRightRadius: radius.panel,
              borderWidth: 1,
              borderColor: colors.border,
              padding: spacing(4),
              paddingBottom: spacing(4) + insets.bottom,
              gap: spacing(3),
              maxHeight: "80%",
            }}
          >
            <Text style={{ color: colors.textPrimary, fontSize: 17, fontWeight: "700" }}>
              {title}
            </Text>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ gap: spacing(1) }}
            >
              {children}
            </ScrollView>
          </SwipeToClose>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/** One option in a sheet: the art when there is some, the words, the tick. */
function OptionRow({
  label,
  detail,
  art,
  on,
  onPress,
}: {
  label: string;
  detail?: string | null;
  art?: ReactNode;
  on: boolean;
  onPress: () => void;
}) {
  return (
    <Tap
      accessibilityLabel={label}
      accessibilityState={{ selected: on }}
      onPress={onPress}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: spacing(3),
        borderRadius: radius.control,
        backgroundColor: on ? colors.accentTint : "transparent",
        paddingHorizontal: spacing(2),
        paddingVertical: spacing(2),
      }}
    >
      {art}
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text
          style={{
            color: on ? colors.accent : colors.textPrimary,
            fontSize: 15,
            fontWeight: "600",
          }}
        >
          {label}
        </Text>
        {detail ? (
          <Text style={{ color: colors.textMuted, fontSize: 12 }}>{detail}</Text>
        ) : null}
      </View>
      {on ? <Ionicons name="checkmark" size={20} color={colors.accent} /> : null}
    </Tap>
  );
}

/**
 * Which printing, down a list with each one's art: "Any printing" first,
 * then every version, the one chosen ticked. Tapping one chooses it and
 * closes, the card picker's "Which <card>?" list (card-picker.tsx) as a
 * sheet.
 */
export function PrintingSheet({
  name,
  cardNumber,
  printings,
  value,
  onPick,
  onClose,
}: {
  name: string;
  cardNumber: string;
  printings: { id: string; label: string | null; imageUrl: string | null }[];
  value: string | null;
  onPick: (printingId: string | null) => void;
  onClose: () => void;
}) {
  const choose = (id: string | null) => {
    onPick(id);
    onClose();
  };
  return (
    <PickerSheet title={`Which ${name}?`} onClose={onClose}>
      <OptionRow
        label="Any printing"
        detail="Whichever version they have"
        on={value === null}
        onPress={() => choose(null)}
      />
      {printings.map((printing) => (
        <OptionRow
          key={printing.id}
          label={printing.label ?? "Standard printing"}
          on={value === printing.id}
          onPress={() => choose(printing.id)}
          art={
            <CardImage imageUrl={printing.imageUrl} width={40} name={name} cardNumber={cardNumber} />
          }
        />
      ))}
    </PickerSheet>
  );
}

export type HuntChoice =
  | { kind: "existing"; id: string }
  | { kind: "new"; name: string }
  | null;

/** What the hunt row says: the hunt's name, a new one's, or None. */
export function huntRowValue(value: HuntChoice, hunts: Hunt[]): string {
  if (!value) return "None";
  if (value.kind === "new") return value.name.trim() || "New hunt";
  return hunts.find((hunt) => hunt.id === value.id)?.name ?? "None";
}

/**
 * Which hunt these cards go in: none, one of theirs with how far along
 * it is, or a new one named right here. Wants only - a hunt is what you
 * are chasing.
 */
export function HuntSheet({
  hunts,
  limit,
  value,
  onChange,
  onClose,
}: {
  hunts: Hunt[];
  limit: number | null;
  value: HuntChoice;
  onChange: (next: HuntChoice) => void;
  onClose: () => void;
}) {
  const [naming, setNaming] = useState(value?.kind === "new");
  const [name, setName] = useState(value?.kind === "new" ? value.name : "");
  const atLimit = limit !== null && hunts.length >= limit;
  const choose = (next: HuntChoice) => {
    onChange(next);
    onClose();
  };

  return (
    <PickerSheet title="Add to a hunt" onClose={onClose}>
      <Muted>Building a deck? Keep these cards together with what is found.</Muted>
      <OptionRow label="No hunt" on={value === null} onPress={() => choose(null)} />
      {hunts
        .filter((hunt): hunt is Hunt & { id: string } => Boolean(hunt.id))
        .map((hunt) => (
          <OptionRow
            key={hunt.id}
            label={hunt.name}
            detail={`${hunt.looking + hunt.found} cards · ${hunt.found} found`}
            on={value?.kind === "existing" && value.id === hunt.id}
            onPress={() => choose({ kind: "existing", id: hunt.id })}
          />
        ))}
      {naming ? (
        <View style={{ gap: spacing(2), paddingTop: spacing(2) }}>
          <Input
            value={name}
            onChangeText={setName}
            placeholder={'Name it, like "Green Zoro"'}
            maxLength={40}
            autoCapitalize="words"
            autoFocus
          />
          <Button
            label="Start this hunt"
            disabled={!name.trim()}
            onPress={() => choose({ kind: "new", name: name.trim() })}
          />
        </View>
      ) : atLimit ? (
        <Muted>{`You are at ${limit} hunts. Add to one of them, or finish one first.`}</Muted>
      ) : (
        <OptionRow
          label="Start a new hunt"
          on={false}
          onPress={() => setNaming(true)}
          art={<Ionicons name="add-circle-outline" size={22} color={colors.accent} />}
        />
      )}
    </PickerSheet>
  );
}
