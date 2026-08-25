import { useCallback, useEffect, useState } from "react";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Image, ScrollView, Text, View } from "react-native";

import type { StackParams } from "../../App";

import { API_BASE } from "../config";
import {
  describeError,
  getMe,
  getProfile,
  previewDeckList,
  renameProfile,
  saveDeckList,
  setHandle,
  type DeckPreviewEntry,
  type Me,
  type Profile,
} from "../api";
import { HandleField, NameField } from "./profile";
import { AsyncButton, Body, Card, Input, Muted, Tap, Title } from "../ui";
import { parseDeckList } from "../deck-list";
import { colors, spacing } from "../theme";

/**
 * Settings: what the Account tab used to be, now behind the profile's cog.
 *
 * Nothing here changed but where it lives — the founder's instruction was
 * exactly that. Your name, your handle, your collection, the deck-list
 * paste box, and the connection test that has earned its keep more than
 * once.
 *
 * The wants list is deliberately NOT here any more: it was a second copy
 * of the Flare tab's, which is the tab named after it.
 */

/** GET and POST the no-auth ping; the verdict names where POSTs die. */
function ConnectionTest() {
  const [result, setResult] = useState<string | null>(null);

  const probe = async (
    label: string,
    method: string,
    body?: string,
    contentType?: string,
    payloadHeader?: string,
  ) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    const started = Date.now();
    try {
      const response = await fetch(`${API_BASE}/api/v1/ping`, {
        method,
        signal: controller.signal,
        headers: {
          ...(contentType ? { "content-type": contentType } : {}),
          ...(payloadHeader ? { "x-cf-payload": payloadHeader } : {}),
        },
        ...(body === undefined ? {} : { body }),
      });
      // The header probe checks arrival, not just status: the server
      // echoes how many header bytes it saw, and that number must match
      // what was sent or a middlebox is stripping the header.
      if (payloadHeader) {
        const echo = (await response.json().catch(() => ({}))) as {
          headerBytes?: number;
        };
        const intact = echo.headerBytes === payloadHeader.length;
        return `${label}: ${response.status}, ${
          intact ? "arrived intact" : "MANGLED"
        } in ${Date.now() - started}ms`;
      }
      return `${label}: ${response.status} in ${Date.now() - started}ms`;
    } catch {
      return `${label}: FAILED after ${Date.now() - started}ms`;
    } finally {
      clearTimeout(timer);
    }
  };

  /*
   * Each row changes exactly one variable; the first FAILED names it.
   * The last row is the transport the app's writes actually use now —
   * payload in the x-cf-payload header, no body — and must pass.
   */
  const MATRIX: [
    string,
    string,
    string | undefined,
    string | undefined,
    string | undefined,
  ][] = [
    ["GET", "GET", undefined, undefined, undefined],
    ["POST empty", "POST", undefined, undefined, undefined],
    ["POST body+json", "POST", "{}", "application/json", undefined],
    ["POST body+plain", "POST", "{}", "text/plain", undefined],
    ["POST body only", "POST", "{}", undefined, undefined],
    ["DELETE empty", "DELETE", undefined, undefined, undefined],
    [
      "POST header payload",
      "POST",
      undefined,
      undefined,
      encodeURIComponent(JSON.stringify({ probe: true })),
    ],
  ];

  return (
    <Card>
      <Title>Connection test</Title>
      {result && <Body>{result}</Body>}
      <AsyncButton
        label="Run test"
        pendingLabel="Testing…"
        variant="secondary"
        onPress={async () => {
          setResult("Testing…");
          const lines: string[] = [];
          for (const [label, method, body, type] of MATRIX) {
            lines.push(await probe(label, method, body, type));
            setResult(lines.join("\n"));
          }
        }}
      />
    </Card>
  );
}

export function SettingsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<StackParams>>();
  const [me, setMe] = useState<Me | null>(null);
  /*
   * Your name lives here rather than on the front of the profile.
   * The founder: "no need to have the name editor front and center on
   * a profile. that should be buried somewhere in the profile
   * settings." Renaming is a once-a-year act; the profile is a place
   * to look at, not a form.
   */
  const [profile, setProfile] = useState<Profile | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [renamed, setRenamed] = useState<string | null>(null);

  const [rehandling, setRehandling] = useState(false);
  const [rehandled, setRehandled] = useState<string | null>(null);

  async function rename(displayName: string) {
    setRenaming(true);
    setRenamed(null);
    try {
      await renameProfile(displayName);
      setProfile((was) => (was ? { ...was, displayName } : was));
      setRenamed("Name updated.");
    } catch (caught) {
      setRenamed(`Could not save that name. ${describeError(caught)}`);
    } finally {
      setRenaming(false);
    }
  }

  async function rehandle(handle: string) {
    setRehandling(true);
    setRehandled(null);
    try {
      await setHandle(handle);
      setProfile((was) => (was ? { ...was, handle } : was));
      setRehandled(`You are now @${handle}.`);
    } catch (caught) {
      setRehandled(describeError(caught));
    } finally {
      setRehandling(false);
    }
  }

  useFocusEffect(
    useCallback(() => {
      let live = true;
      void (async () => {
        try {
          const [result, mine] = await Promise.all([
            getMe(),
            getProfile().catch(() => null),
          ]);
          if (live) {
            setMe(result);
            setProfile(mine?.profile ?? null);
          }
        } catch {
          if (live) setMe(null);
        }
      })();
      return () => {
        live = false;
      };
    }, []),
  );

  return (
    <ScrollView contentContainerStyle={{ padding: spacing(4), gap: spacing(4) }}>
      {profile && (
        <Card>
          <Title>Your name</Title>
          <Body>
            What people see next to everything you post. Spaces and capitals are fine,
            and it does not have to be unique.
          </Body>
          <NameField current={profile.displayName} busy={renaming} onSave={rename} />
          {renamed && <Muted>{renamed}</Muted>}

          {/* The other half of the same question, in the same card, the
              same way the website groups them. */}
          <Title>How people find you</Title>
          <Body>
            Your handle is yours alone. Letters, numbers and underscores, so it can
            be said out loud and typed without guessing.
          </Body>
          <HandleField
            current={profile.handle}
            busy={rehandling}
            onSave={rehandle}
          />
          {rehandled && <Muted>{rehandled}</Muted>}
        </Card>
      )}

      {me?.collection && (
        <Card>
          <Title>Your collection</Title>
          <Muted>
            {`${me.collection.cardsMatched.toLocaleString()} cards along, matched quietly in every room and never listed.`}
          </Muted>
        </Card>
      )}

      {/*
       * One list, not two.
       *
       * This was a second copy of the Flare tab's list - the founder:
       * "the 'saved wants' section in the settings is kinda redundant,
       * since it's just the flare section, jsut elsewhere." He is right,
       * and two renderings of one list is how they drift: the tab learned
       * to say which cards are live on a board and this one never would.
       *
       * The paste box stays, because pasting a deck is a settings-shaped
       * act - done once, at home, with a keyboard - and it has nowhere
       * better to live yet.
       */}
      <Card>
        <Title>Paste a deck list</Title>
        <Body>
          Every card in it becomes a want. Walk into any room and it offers to
          post the lot in one go.
        </Body>

        <DeckListField />

        <Tap
          onPress={() => navigation.navigate("Tabs", { screen: "Flare" })}
          accessibilityLabel="Open your Flares"
          style={{ paddingTop: spacing(1) }}
        >
          <Text style={{ color: colors.accent, fontWeight: "600" }}>
            {me && me.wants.length > 0
              ? `See all ${me.wants.length} on the Flare tab →`
              : "Your Flares live on the Flare tab →"}
          </Text>
        </Tap>
      </Card>

      <Card>
        <Title>Email and password</Title>
        <Body>
          Both live on the website: open cardflare.gg, go to your profile, then
          settings. Signing in here uses whatever you set there.
        </Body>
      </Card>

      <ConnectionTest />
    </ScrollView>
  );
}

/**
 * Paste a deck, get a want list — the app's twin of the website's form.
 *
 * What lands here are wants, not Flares. The room posts them as one
 * batch when the player walks in, which is what keeps a thirty-card deck
 * to a single notification and a single Feed item.
 */
function DeckListField() {
  const [list, setList] = useState("");
  const [label, setLabel] = useState("");
  const [said, setSaid] = useState<string | null>(null);

  const { lines } = parseDeckList(list);

  /*
   * The looked-up preview, held WITH the text that produced it, so
   * "still loading" is derived by comparison — the website form's exact
   * shape. The founder's ask: "have a loading screen that loads all
   * cards, with images, for confirmation that they are the cards
   * someone wants." Null entries mean the lookup itself failed; the
   * save is not blocked over a courtesy, but the screen says so.
   */
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
        One card per line. Counts in front or behind both work, with or without a
        space, and anything after the number is ignored.
      </Muted>

      {loading && <Muted>Loading your cards…</Muted>}
      {preview === null && lines.length > 0 && (
        <Muted>Could not load the previews. You can still save.</Muted>
      )}

      {preview && preview.length > 0 && (
        <View style={{ gap: spacing(2) }}>
          <Muted>Check the faces, then save.</Muted>
          {preview.map((entry) => (
            <View
              key={entry.cardNumber}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: spacing(2),
              }}
            >
              {/* The confirmation IS the picture. An empty slot where
                  one should be is itself the message: this number
                  matched nothing. */}
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
              <Text
                style={{
                  color: colors.textSecondary,
                  fontSize: 14,
                  fontWeight: "700",
                }}
              >
                ×{entry.quantity}
              </Text>
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
              : `These are right, save ${lines.length}`
        }
        pendingLabel="Saving…"
        disabled={lines.length === 0 || loading}
        onPress={async () => {
          setSaid(null);
          try {
            const result = await saveDeckList(list, label.trim() || null);
            setList("");
            setLabel("");
            setSaid(
              `${result.saved} saved.${
                result.unknown.length > 0
                  ? ` Not in the catalogue: ${result.unknown.slice(0, 6).join(", ")}.`
                  : ""
              }${result.atCap ? " Your list is full, so the rest were skipped." : ""}`,
            );
          } catch (caught) {
            setSaid(describeError(caught));
          }
        }}
      />
      {said ? <Muted>{said}</Muted> : null}
    </View>
  );
}
