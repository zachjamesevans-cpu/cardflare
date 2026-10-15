import { Ionicons } from "@expo/vector-icons";
import type { ReactNode } from "react";
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
import { SwipeToClose } from "./sheet-swipe";
import { colors, radius, spacing } from "./theme";
import { CardImage, Tap } from "./ui";

/**
 * The composer's printing, which used to scroll sideways, as a row that
 * says what is chosen and a sheet that lists the options DOWN, the way
 * the rest of the app picks; and the hunt it was opened from.
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

/** The hunt a post goes into: only ever the one it was opened from. */
export type HuntChoice = { kind: "existing"; id: string } | null;

/**
 * The one sign of a hunt in the composer: "Adding to Green Zoro", and
 * only when it was opened from that hunt's "+". There is no picker any
 * more. The founder: "okay, im posting a flare, but also adding to a
 * hunt? ... i think it's a bit convoluted when you're posting a
 * flare." A Flare is the cards you are looking for; a hunt is built on
 * its own screen. The cross posts the same cards as a plain Flare.
 */
export function AddingToHunt({
  name,
  onLeave,
}: {
  name: string | null;
  onLeave: () => void;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: spacing(2.5),
        borderRadius: radius.control,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.elevated,
        paddingLeft: spacing(3),
        paddingRight: spacing(1),
        paddingVertical: spacing(1),
      }}
    >
      <Ionicons name="locate-outline" size={18} color={colors.accent} />
      <Text
        numberOfLines={1}
        style={{ flex: 1, minWidth: 0, color: colors.textSecondary, fontSize: 14 }}
      >
        {"Adding to "}
        <Text style={{ color: colors.textPrimary, fontWeight: "700" }}>
          {name ?? "your hunt"}
        </Text>
      </Text>
      <Tap
        accessibilityLabel="Post without the hunt"
        hitSlop={8}
        onPress={onLeave}
        style={{ width: 36, height: 36, alignItems: "center", justifyContent: "center" }}
      >
        <Ionicons name="close" size={18} color={colors.textMuted} />
      </Tap>
    </View>
  );
}
