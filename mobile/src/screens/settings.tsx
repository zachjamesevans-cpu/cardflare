import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useState } from "react";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Image, ScrollView, Text, View } from "react-native";

import type { StackParams } from "../../App";

import { API_BASE } from "../config";
import {
  ApiError,
  type DeckPreviewEntry,
  deleteAccount,
  describeError,
  getMe,
  getProfile,
  getPushPrefs,
  listBlockedPlayers,
  type BlockedPlayer,
  type Me,
  previewDeckList,
  type Profile,
  saveDeckList,
  setAutoPost as saveAutoPost,
  setFeedView,
  setPushPref,
  signOut,
  unblockPlayer,
} from "../api";
import { GiftBar } from "../gift-bar";
import { formatHandle } from "../handle";
import {
  AsyncButton,
  Body,
  Button,
  Card,
  ErrorLine,
  Input,
  Muted,
  Tap,
  Title,
} from "../ui";
import { parseDeckList } from "../deck-list";
import { QuantityBadge } from "../quantity-badge";
import {
  PUSH_GROUPS,
  PUSH_HEADING,
  PUSH_LINE,
  type PushGroup,
  type PushPrefs,
} from "../push-copy";
import { colors, gutter, radius, spacing } from "../theme";
import {
  FEED_VIEWS,
  FEED_VIEW_BLURBS,
  FEED_VIEW_TITLES,
  feedViewFrom,
  type FeedView,
} from "../feed-views";

/**
 * Settings: what the Account tab used to be, now behind the profile's cog.
 *
 * Nothing here changed but where it lives — the founder's instruction was
 * exactly that. Your collection, how the Feed is drawn, the deck-list
 * paste box, and the connection test that has earned its keep more than
 * once.
 *
 * The wants list is deliberately NOT here any more: it was a second copy
 * of the Flare tab's, which is the tab named after it. Your name and
 * handle moved too: they are rows on Edit profile now, with the
 * pronouns and the bio, the way Instagram keeps them.
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
  /* Seeded from the account on focus, so the radio matches what the
     Feed is actually drawing. */
  const [view, setView] = useState<FeedView>("classic");
  const [savingView, setSavingView] = useState(false);
  /*
   * A FAILED SAVE HAS TO SAY SO.
   *
   * The founder: "clicking compact clicks it back to classic
   * immediately upon clicking." It was doing the right thing for the
   * wrong-looking reason - the write failed, so the optimistic choice
   * was put back - but it put it back in silence, which reads as a
   * setting that does not work rather than one that could not save.
   */
  const [viewError, setViewError] = useState<string | null>(null);
  /* Whether joining a room posts your Flares to it. On until the
     account says otherwise, which is also what an older server means. */
  const [autoPost, setAutoPost] = useState(true);
  const [autoPostError, setAutoPostError] = useState<string | null>(null);
  /* The handle, for the delete-account lock at the bottom. Name and
     handle are edited on Edit profile, not here. */
  const [profile, setProfile] = useState<Profile | null>(null);

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
            setView(feedViewFrom(result.player.feedView));
            setAutoPost(result.player.autoPostFlares ?? true);
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

  /* The stores this account owns that carry a bar; nobody else's. */
  const ownedGifts = (me?.staff ?? []).flatMap((row) =>
    row.role === "owner" && row.gift ? [{ ...row, gift: row.gift }] : [],
  );

  return (
    <ScrollView
      contentContainerStyle={{
        paddingHorizontal: gutter,
        paddingVertical: spacing(4),
        gap: spacing(4),
      }}
    >
      {/*
       * YOUR STORE: the console's green bar, for an owner whose store has
       * one (a beta gift's days, a Founding Store, or the trial's). Said
       * once per store, named, and absent for everyone else.
       */}
      {ownedGifts.length > 0 ? (
        <View style={{ gap: spacing(2) }}>
          <Title>{ownedGifts.length === 1 ? "Your store" : "Your stores"}</Title>
          {ownedGifts.map((row) => (
            <GiftBar key={row.storeId} bar={row.gift} storeName={row.name} />
          ))}
        </View>
      ) : null}

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
      {/*
       * The Lab, from Settings rather than from a gesture nobody would
       * find. It ships in the binary on purpose: the person who needs it
       * is holding a TestFlight build, not a debug one.
       */}
      {/*
       * HOW THE FEED IS DRAWN. The founder: "lets develop a few 'views'
       * for the feed, that can be changed under settings in the
       * profile." On the account rather than the device, so picking
       * Compact on a phone holds on the website too.
       */}
      <Card>
        <Title>Feed view</Title>
        <Body>Pick how a Flare is drawn in your Feed.</Body>
        <View style={{ gap: spacing(2) }}>
          {FEED_VIEWS.map((option) => {
            const on = view === option;
            return (
              <Tap
                key={option}
                accessibilityLabel={`${FEED_VIEW_TITLES[option]}${on ? ", selected" : ""}`}
                onPress={() => {
                  if (on || savingView) return;
                  const previous = view;
                  setView(option);
                  setViewError(null);
                  setSavingView(true);
                  /* Optimistic: the Feed redraws at once and the write
                     follows. A failure puts the choice back rather than
                     leaving a setting that did not save. */
                  setFeedView(option)
                    .catch(() => {
                      setView(previous);
                      setViewError("Could not save that. Try again in a moment.");
                    })
                    .finally(() => setSavingView(false));
                }}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: spacing(2.5),
                  borderRadius: radius.control,
                  borderWidth: 1,
                  borderColor: on ? colors.accent : colors.border,
                  backgroundColor: on ? "rgba(198,238,79,0.08)" : colors.elevated,
                  padding: spacing(3),
                }}
              >
                <Ionicons
                  name={on ? "radio-button-on" : "radio-button-off"}
                  size={18}
                  color={on ? colors.accent : colors.textMuted}
                />
                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                  <Text
                    style={{
                      color: on ? colors.accent : colors.textPrimary,
                      fontWeight: "700",
                    }}
                  >
                    {FEED_VIEW_TITLES[option]}
                  </Text>
                  <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                    {FEED_VIEW_BLURBS[option]}
                  </Text>
                </View>
              </Tap>
            );
          })}
        </View>
        {viewError ? <ErrorLine message={viewError} /> : null}
      </Card>

      {/*
       * ROOMS. The founder: "I wonder if it's best to just join a room
       * and all the flares immediately get posted. That's kinda the
       * whole point of cardflare." So joining does, and this is the one
       * way to say no: for the person who wants to walk in and browse
       * first. The website's settings draw the same switch.
       */}
      <Card>
        <Title>Rooms</Title>
        <Body>
          When you join a room, your open Flares go up on its board. Turn this off to
          walk in and browse first.
        </Body>
        <Tap
          accessibilityLabel={`Post my Flares when I join a room, ${autoPost ? "on" : "off"}`}
          onPress={() => {
            const next = !autoPost;
            setAutoPost(next);
            setAutoPostError(null);
            saveAutoPost(next).catch(() => {
              setAutoPost(!next);
              setAutoPostError("Could not save that. Try again in a moment.");
            });
          }}
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            gap: spacing(3),
            borderRadius: radius.control,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.elevated,
            padding: spacing(3),
          }}
        >
          <Text style={{ color: colors.textPrimary, fontWeight: "700", flexShrink: 1 }}>
            Post my Flares when I join a room
          </Text>
          <Ionicons
            name={autoPost ? "toggle" : "toggle-outline"}
            size={32}
            color={autoPost ? colors.accent : colors.textMuted}
          />
        </Tap>
        {autoPostError ? <ErrorLine message={autoPostError} /> : null}
      </Card>

      <PushPrefSwitches />

      <BlockedPlayers />

      {/* Tooling, for a development build only. A player's settings
          page is not the place for a design lab or a connection probe;
          both stay in the binary for the person holding a dev client. */}
      {__DEV__ && (
        <Card>
          <Title>Design lab</Title>
          <Body>
            Every shape a Feed post can take, drawn with made-up data. Nothing in it
            reaches the server.
          </Body>
          <Button
            label="Open the design lab"
            variant="secondary"
            onPress={() => navigation.navigate("Lab")}
          />
        </Card>
      )}

      <Card>
        <Title>Paste a deck list</Title>
        <Body>
          Every card in it becomes a Flare. Walk into any room and it offers to post the
          lot in one go.
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

      {__DEV__ && <ConnectionTest />}

      {profile && <DeleteAccount handle={profile.handle} />}
    </ScrollView>
  );
}

/**
 * PUSH NOTIFICATIONS: what buzzes the phone, by group. The website's
 * settings draw the same four switches in the same words
 * (src/components/players/push-pref-toggles.tsx); the Inbox keeps
 * every notice whatever these say.
 *
 * Null until the first read lands, so the switches never paint a
 * default somebody then "turns off" that was never on. Its own read,
 * so a settings screen on an older server still draws everything
 * else. Optimistic on a tap, the way the Rooms switch is: the switch
 * moves at once, the write follows, and a failure paints the truth
 * back and says so.
 */
function PushPrefSwitches() {
  const [prefs, setPrefs] = useState<PushPrefs | null>(null);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let live = true;
      getPushPrefs()
        .then((result) => {
          if (!live) return;
          setPrefs(result.prefs);
          setError(null);
        })
        .catch(() => {
          /* No switches to draw until the read lands; the line says why. */
          if (!live) return;
          setPrefs((current) => {
            if (!current) {
              setError("Could not load these right now. Try again in a moment.");
            }
            return current;
          });
        });
      return () => {
        live = false;
      };
    }, []),
  );

  const flip = (group: PushGroup) => {
    if (!prefs) return;
    const next = !prefs[group];
    setPrefs({ ...prefs, [group]: next });
    setError(null);
    setPushPref(group, next)
      .then((result) => setPrefs(result.prefs))
      .catch(() => {
        setPrefs((current) => (current ? { ...current, [group]: !next } : current));
        setError("Could not save that. Try again in a moment.");
      });
  };

  return (
    <Card>
      <Title>{PUSH_HEADING}</Title>
      <Muted>{PUSH_LINE}</Muted>
      {prefs ? (
        <View style={{ gap: spacing(2) }}>
          {PUSH_GROUPS.map(({ key, label, line }) => {
            const on = prefs[key];
            return (
              <Tap
                key={key}
                accessibilityLabel={`${label}, ${on ? "on" : "off"}`}
                onPress={() => flip(key)}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: spacing(3),
                  borderRadius: radius.control,
                  borderWidth: 1,
                  borderColor: colors.border,
                  backgroundColor: colors.elevated,
                  padding: spacing(3),
                }}
              >
                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                  <Text style={{ color: colors.textPrimary, fontWeight: "700" }}>
                    {label}
                  </Text>
                  <Text style={{ color: colors.textMuted, fontSize: 12 }}>{line}</Text>
                </View>
                <Ionicons
                  name={on ? "toggle" : "toggle-outline"}
                  size={32}
                  color={on ? colors.accent : colors.textMuted}
                />
              </Tap>
            );
          })}
        </View>
      ) : null}
      <ErrorLine message={error} />
    </Card>
  );
}

/**
 * The people you have blocked, with Unblock beside each: the website's
 * settings card. A block is made on somebody's profile and undone
 * either there or here. Re-read on focus, because a block made on a
 * profile a moment ago belongs on this list the moment it opens.
 */
function BlockedPlayers() {
  /* Null until the first read lands, so an empty list is the server's
     word and not a loading gap. */
  const [blocked, setBlocked] = useState<BlockedPlayer[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async (alive: () => boolean = () => true) => {
    try {
      const result = await listBlockedPlayers();
      if (alive()) setBlocked(result.blocked);
    } catch {
      /* An older server has no list; the card stays on its last word. */
      if (alive()) setBlocked((current) => current ?? []);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      let live = true;
      void load(() => live);
      return () => {
        live = false;
      };
    }, [load]),
  );

  const unblock = async (playerId: string) => {
    if (busy) return;
    setBusy(playerId);
    setError(null);
    try {
      await unblockPlayer(playerId);
      await load();
    } catch {
      setError("Could not unblock them right now. Try again in a moment.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card>
      <Title>Blocked players</Title>
      {blocked === null ? null : blocked.length === 0 ? (
        <Muted>Nobody. Blocking somebody on their profile puts them here.</Muted>
      ) : (
        <View style={{ gap: spacing(2) }}>
          {blocked.map((person) => (
            <View
              key={person.playerId}
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                gap: spacing(3),
                borderRadius: radius.control,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.elevated,
                padding: spacing(3),
              }}
            >
              <View style={{ flexShrink: 1, minWidth: 0 }}>
                <Text
                  numberOfLines={1}
                  style={{ color: colors.textPrimary, fontWeight: "700" }}
                >
                  {person.displayName}
                </Text>
                {person.handle ? (
                  <Text
                    numberOfLines={1}
                    style={{ color: colors.textMuted, fontSize: 12 }}
                  >
                    {formatHandle(person.handle)}
                  </Text>
                ) : null}
              </View>
              <Button
                label="Unblock"
                variant="secondary"
                busy={busy === person.playerId}
                disabled={busy !== null && busy !== person.playerId}
                onPress={() => void unblock(person.playerId)}
              />
            </View>
          ))}
        </View>
      )}
      <ErrorLine message={error} />
    </Card>
  );
}

/**
 * Deleting the account, from inside the app.
 *
 * App Store Review Guideline 5.1.1(v): an app that creates accounts
 * has to let people delete them here, not by email. Closed by default
 * so the most destructive control on the screen cannot be hit in
 * passing; open, it wants the handle typed back and the server checks
 * the same thing. The website's settings page carries the same card in
 * the same words.
 */
function DeleteAccount({ handle }: { handle: string }) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [said, setSaid] = useState<string | null>(null);
  const matches = typed.trim().replace(/^@/, "").toLowerCase() === handle.toLowerCase();

  return (
    <Card>
      <Title>Delete your account</Title>
      <Body>
        Everything goes: profile, Flares, lists, showcase and unlocks. There is no undo.
      </Body>
      {open ? (
        <>
          <Body>Type your handle, @{handle}, to confirm.</Body>
          <Input
            value={typed}
            onChangeText={setTyped}
            placeholder={`@${handle}`}
            autoCapitalize="none"
            autoCorrect={false}
            accessibilityLabel="Type your handle to confirm"
          />
          <AsyncButton
            label="Delete my account"
            pendingLabel="Deleting…"
            disabled={!matches}
            onPress={async () => {
              setSaid(null);
              try {
                await deleteAccount(typed);
                await signOut();
              } catch (caught) {
                setSaid(
                  caught instanceof ApiError && caught.code === "handle-mismatch"
                    ? "That is not your handle."
                    : `The account could not be deleted (${describeError(caught)}). Try again.`,
                );
              }
            }}
          />
          <Tap
            accessibilityLabel="Keep the account"
            onPress={() => {
              setOpen(false);
              setTyped("");
              setSaid(null);
            }}
          >
            <Muted>Keep it</Muted>
          </Tap>
          {said && <Muted>{said}</Muted>}
        </>
      ) : (
        <Tap accessibilityLabel="Delete your account" onPress={() => setOpen(true)}>
          <Text style={{ color: colors.danger, fontSize: 14 }}>
            Delete your account
          </Text>
        </Tap>
      )}
    </Card>
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
        One card per line. Counts in front or behind both work, with or without a space,
        and anything after the number is ignored.
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
