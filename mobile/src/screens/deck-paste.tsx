import { useEffect, useState } from "react";
import { Image, KeyboardAvoidingView, Platform, ScrollView, Text, View } from "react-native";

import { type DeckPreviewEntry, friendlyError, previewDeckList, saveDeckList } from "../api";
import { parseDeckList } from "../deck-list";
import { QuantityBadge } from "../quantity-badge";
import { colors, gutter, spacing } from "../theme";
import { AsyncButton, Body, Card, Input, Muted, Title } from "../ui";

/**
 * Paste a deck list: every card in it goes up as one Flare post.
 *
 * This used to sit in Settings, where it had landed as "a settings-
 * shaped act" before posting was what a Flare did. The founder's Settings
 * review: it is old, its words were wrong ("walk into any room and it
 * offers to post the lot" - since September a paste posts at once), and
 * it belongs where Flares are made. So it is its own screen now, opened
 * from Post a Flare and from the Feed's "What are you looking for?"
 * starter. The website's paste does the same thing in the same words.
 */
export function DeckPasteScreen() {
  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          paddingHorizontal: gutter,
          paddingVertical: spacing(4),
          gap: spacing(4),
        }}
      >
        <Card>
          <Title>Paste a deck list</Title>
          <Body>{DECK_PASTE_LINE}</Body>
          <DeckListField />
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/** What a paste does, said once: the screen, the Feed starter and the website. */
export const DECK_PASTE_LINE =
  "Every card in it goes up as one Flare post, so people nearby and your friends see what you are after.";

/**
 * The paste box with its looked-up preview: check the faces, then post.
 *
 * The founder's ask: "have a loading screen that loads all cards, with
 * images, for confirmation that they are the cards someone wants." The
 * preview is held WITH the text that produced it, so "still loading" is
 * derived by comparison - the website form's exact shape. Null entries
 * mean the lookup itself failed; posting is not blocked over a courtesy,
 * but the screen says so.
 */
function DeckListField() {
  const [list, setList] = useState("");
  const [label, setLabel] = useState("");
  const [said, setSaid] = useState<string | null>(null);

  const { lines } = parseDeckList(list);

  const [settled, setSettled] = useState<{
    list: string;
    entries: DeckPreviewEntry[] | null;
  } | null>(null);

  useEffect(() => {
    if (parseDeckList(list).lines.length === 0) return;

    let current = true;
    const timer = setTimeout(() => {
      previewDeckList(list)
        .then((result) => {
          if (current) setSettled({ list, entries: result.entries });
        })
        .catch(() => {
          if (current) setSettled({ list, entries: null });
        });
    }, 500);

    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [list]);

  const preview = settled?.list === list ? settled.entries : undefined;
  const loading = lines.length > 0 && preview === undefined;

  return (
    <View style={{ gap: spacing(2) }}>
      <Input
        value={list}
        onChangeText={(next) => {
          setList(next);
          setSaid(null);
        }}
        placeholder={"Paste a deck list\n4x OP17-001\n2xOP17-005"}
        multiline
        numberOfLines={5}
        autoCapitalize="characters"
        autoCorrect={false}
        style={{ minHeight: 110, textAlignVertical: "top" }}
      />
      <Input
        value={label}
        onChangeText={setLabel}
        placeholder="Call it something (optional)"
        maxLength={40}
      />
      <Muted>
        One card per line. Counts in front or behind both work, with or without a space,
        and anything after the number is ignored.
      </Muted>

      {loading && <Muted>Loading your cards…</Muted>}
      {preview === null && lines.length > 0 && (
        <Muted>Could not load the previews. You can still post.</Muted>
      )}

      {preview && preview.length > 0 && (
        <View style={{ gap: spacing(2) }}>
          <Muted>Check the faces, then post.</Muted>
          {preview.map((entry) => (
            <View
              key={entry.cardNumber}
              style={{ flexDirection: "row", alignItems: "center", gap: spacing(2) }}
            >
              {/* The confirmation IS the picture. An empty slot where one
                  should be is itself the message: this number matched
                  nothing. */}
              <View
                style={{
                  width: 40,
                  height: 56,
                  borderRadius: 4,
                  overflow: "hidden",
                  borderWidth: 1,
                  borderColor: colors.border,
                  backgroundColor: colors.canvas,
                }}
              >
                {entry.imageUrl ? (
                  <Image
                    source={{ uri: entry.imageUrl }}
                    style={{ width: "100%", height: "100%" }}
                    resizeMode="cover"
                  />
                ) : null}
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text
                  numberOfLines={1}
                  style={{
                    color: entry.name ? colors.textPrimary : colors.danger,
                    fontSize: 14,
                    fontWeight: "600",
                  }}
                >
                  {entry.name ?? "Not in the catalogue yet"}
                </Text>
                <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                  {entry.cardNumber}
                </Text>
              </View>
              <QuantityBadge quantity={entry.quantity} size="md" />
            </View>
          ))}
        </View>
      )}

      <AsyncButton
        label={
          lines.length === 0
            ? "Paste a list first"
            : loading
              ? "Loading your cards…"
              : `These are right, post ${lines.length}`
        }
        pendingLabel="Posting…"
        disabled={lines.length === 0 || loading}
        onPress={async () => {
          setSaid(null);
          try {
            const result = await saveDeckList(list, label.trim() || null);
            setList("");
            setLabel("");
            const unknown =
              result.unknown.length > 0
                ? ` Not in the catalogue: ${result.unknown.slice(0, 6).join(", ")}.`
                : "";
            setSaid(
              result.saved > 0
                ? `Posted ${result.saved} ${result.saved === 1 ? "card" : "cards"} as one Flare.${unknown}`
                : `Nothing to post.${unknown}`,
            );
          } catch (caught) {
            setSaid(`That did not post. ${friendlyError(caught)}`);
          }
        }}
      />
      {said ? <Muted>{said}</Muted> : null}
    </View>
  );
}
