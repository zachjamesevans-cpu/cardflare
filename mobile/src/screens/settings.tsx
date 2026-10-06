import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useRef, useState } from "react";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { AppState, Linking, ScrollView, Text, View } from "react-native";

import type { StackParams } from "../../App";

import { API_BASE } from "../config";
import {
  ApiError,
  type BlockedPlayer,
  deleteAccount,
  friendlyError,
  getMe,
  getProfile,
  getPostalCode,
  getPushPrefs,
  listBlockedPlayers,
  type Me,
  savePostalCode,
  setAutoPost as saveAutoPost,
  setFeedView,
  setPushPref,
  signOut,
  storedAccessToken,
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
  Loading,
  Muted,
  Tap,
  Title,
} from "../ui";
import { cachedPlayerId, readCache, writeCache } from "../cache";
import { restorePro } from "../pro";
import { APPLE_SUBSCRIPTIONS_URL, CLAIMED_MESSAGE } from "../pro-copy";
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
 * Settings, behind the profile's cog: how the app behaves for you, and
 * the account housekeeping App Review expects to find in one place.
 *
 * The founder's review (2026-10-06): "a lot of that stuff is old from
 * much earlier builds". So, top to bottom: your store's bar, your
 * collection, Feed view, Rooms, push, blocked players, then Account
 * (email, ZIP, Pro, help and the legal pages, the version), Sign out,
 * and Delete account last. The deck paste moved to its own screen,
 * opened from Post a Flare; the dev connection probe is gone. Name,
 * handle, pronouns and bio live on Edit profile, the way Instagram keeps
 * them.
 */

/** Everything the screen reads on open, kept together on disk too. */
interface SettingsData {
  me: Me;
  /* The ZIP on the account, which Nearby and distances read. */
  postalCode: string | null;
  prefs: PushPrefs | null;
  blocked: BlockedPlayer[];
}

export function SettingsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<StackParams>>();
  const [me, setMe] = useState<Me | null>(null);
  /* Set when /me failed with nothing cached but the phone is signed
     in: what Delete account knows of the handle (null for nothing). */
  const [deleteFallback, setDeleteFallback] = useState<{ handle: string | null } | null>(
    null,
  );
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
  /* The ZIP, shown and changed on the Account card. */
  const [postalCode, setPostalCode] = useState<string | null>(null);

  /* The switches and the blocked list, read in the same batch as the
     account so the screen arrives whole. Null until that batch lands. */
  const [prefs, setPrefs] = useState<PushPrefs | null>(null);
  const [blocked, setBlocked] = useState<BlockedPlayer[] | null>(null);
  /* True once the first batch has settled, or the last visit's copy
     painted: until then one loading line, not a screen assembling. */
  const [ready, setReady] = useState(false);
  /* Set once a fresh read has painted, so a slow disk read never
     paints last week's copy over it. */
  const fresh = useRef(false);

  /*
   * ONE READ, ONE PAINT.
   *
   * The founder, backing out of Settings and coming back: "seems like
   * they dont load everything at once and stuff pops in". It was four
   * reads landing on their own schedules - the account and profile,
   * the push switches and the blocked list each in their own component
   * - and sections that only draw once their data arrives (your store,
   * your collection, the switches), so the page grew and shifted as each
   * one came back. The profile read is gone from it too: Delete account
   * needed only the handle, which the account already carries.
   *
   * Now all four go out together and the screen paints once they have
   * all settled. The last visit's copy is kept on disk, so a second
   * open paints at once from it while the fresh read lands over the
   * top in a single step.
   */
  const apply = useCallback((data: SettingsData) => {
    setMe(data.me);
    setPostalCode(data.postalCode);
    setView(feedViewFrom(data.me.player.feedView));
    setAutoPost(data.me.player.autoPostFlares ?? true);
    setPrefs(data.prefs);
    setBlocked(data.blocked);
    setReady(true);
  }, []);

  useEffect(() => {
    let live = true;
    void (async () => {
      const playerId = await cachedPlayerId();
      if (!playerId) return;
      const cached = await readCache<SettingsData>("settings", playerId);
      /* Only if the fresh read has not beaten it here. */
      if (live && cached && !fresh.current) apply(cached);
    })();
    return () => {
      live = false;
    };
  }, [apply]);

  useFocusEffect(
    useCallback(() => {
      let live = true;
      void (async () => {
        const [account, zip, push, blocks] = await Promise.allSettled([
          getMe(),
          getPostalCode(),
          getPushPrefs(),
          listBlockedPlayers(),
        ]);
        if (!live) return;
        if (account.status !== "fulfilled") {
          /* Draw what can be drawn rather than spin forever. */
          setReady(true);
          /*
           * And Delete account must still be here: App Review's
           * 5.1.1(v) does not care that /me had a bad moment. The
           * handle comes from a profile read instead, and failing that
           * the card asks for it typed with nothing to compare against
           * on the phone; the server checks it either way.
           */
          if (await storedAccessToken()) {
            const handle = await getProfile()
              .then((result) => result.profile.handle || null)
              .catch(() => null);
            if (live) setDeleteFallback({ handle });
          }
          return;
        }
        const data: SettingsData = {
          me: account.value,
          postalCode: zip.status === "fulfilled" ? zip.value.postalCode : null,
          prefs: push.status === "fulfilled" ? push.value.prefs : null,
          /* An older server has no list: an empty one, not a gap. */
          blocked: blocks.status === "fulfilled" ? blocks.value.blocked : [],
        };
        fresh.current = true;
        apply(data);
        void writeCache("settings", data.me.player.id, data);
      })();
      return () => {
        live = false;
      };
    }, [apply]),
  );

  if (!ready) return <Loading />;

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
          <Body>
            {`${me.collection.cardsMatched.toLocaleString()} cards imported. Rooms quietly flag the Flares you could answer; nobody else ever sees it.`}
          </Body>
          {/* The Collectr import is a file upload, which the website does
              well and a phone does badly. */}
          <Tap
            accessibilityLabel="Update your collection on cardflare.gg"
            onPress={() => void Linking.openURL(`${API_BASE}/profile/settings`)}
          >
            <Text style={{ color: colors.accent, fontWeight: "600" }}>
              Update it on cardflare.gg →
            </Text>
          </Tap>
        </Card>
      )}

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
                  backgroundColor: on ? colors.accentTint : colors.elevated,
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

      <PushPrefSwitches initial={prefs} />

      <BlockedPlayers initial={blocked} />

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

      <AccountCard
        email={me?.player.email ?? null}
        postalCode={postalCode}
        onPostalCode={setPostalCode}
      />

      <ProCard />

      <HelpCard />

      <AsyncButton
        label="Sign out"
        pendingLabel="Signing out…"
        variant="secondary"
        onPress={async () => {
          await signOut();
        }}
      />

      {/* Always here when the account is: App Review's 5.1.1(v). It used
          to wait on a separate profile read and vanished when that one
          failed. */}
      {me?.player.handle ? (
        <DeleteAccount handle={me.player.handle} />
      ) : deleteFallback ? (
        <DeleteAccount handle={deleteFallback.handle} />
      ) : null}
    </ScrollView>
  );
}

/**
 * PUSH NOTIFICATIONS: what buzzes the phone, by group. The website's
 * settings draw the same four switches in the same words
 * (src/components/players/push-pref-toggles.tsx); the Inbox keeps
 * every notice whatever these say.
 *
 * Read with the rest of the screen, in its one batch, and handed in:
 * null when that read failed, so the switches never paint a default
 * somebody then "turns off" that was never on, and the line says why.
 * Optimistic on a tap, the way the Rooms switch is: the switch moves
 * at once, the write follows, and a failure paints the truth back and
 * says so.
 */
function PushPrefSwitches({ initial }: { initial: PushPrefs | null }) {
  const [prefs, setPrefs] = useState<PushPrefs | null>(initial);
  const [error, setError] = useState<string | null>(null);

  /* A fresher batch landing (the next open) takes over. */
  useEffect(() => {
    if (initial) setPrefs(initial);
  }, [initial]);

  const unread = prefs === null ? "Could not load these right now. Try again in a moment." : null;

  /*
   * Whether iOS lets the app buzz at all. These switches are the
   * account's; the phone's own permission sits above them, and with it
   * off every switch still read "on" while nothing ever arrived. Checked
   * again whenever the app comes back, so turning it on in iOS Settings
   * clears the line without reopening the screen.
   */
  const [phoneOff, setPhoneOff] = useState(false);
  useEffect(() => {
    const check = () =>
      void Notifications.getPermissionsAsync()
        .then((status) => setPhoneOff(!status.granted))
        .catch(() => setPhoneOff(false));
    check();
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") check();
    });
    return () => sub.remove();
  }, []);

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
      {phoneOff ? (
        <Tap
          accessibilityLabel="Notifications are off for cardflare. Open iOS Settings"
          onPress={() => void Linking.openSettings()}
        >
          <Text style={{ color: colors.danger, fontSize: 13 }}>
            Notifications are off for cardflare on this phone, so none of these will
            arrive. Turn them on in iOS Settings →
          </Text>
        </Tap>
      ) : null}
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
      <ErrorLine message={error ?? unread} />
    </Card>
  );
}

/**
 * The people you have blocked, with Unblock beside each: the website's
 * settings card. A block is made on somebody's profile and undone
 * either there or here. Read with the rest of the screen on every
 * focus, because a block made on a profile a moment ago belongs on this
 * list the moment it opens.
 */
function BlockedPlayers({ initial }: { initial: BlockedPlayer[] | null }) {
  const [blocked, setBlocked] = useState<BlockedPlayer[] | null>(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  /* A fresher batch landing (the next open) takes over. */
  useEffect(() => {
    if (initial) setBlocked(initial);
  }, [initial]);

  /* After an unblock, the list as the server now has it. */
  const load = async () => {
    try {
      const result = await listBlockedPlayers();
      setBlocked(result.blocked);
    } catch {
      /* An older server has no list; the card stays on its last word. */
      setBlocked((current) => current ?? []);
    }
  };

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
      <Muted>
        You do not see their posts, and neither of you can message the other. They are
        not told.
      </Muted>
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
function DeleteAccount({ handle }: { handle: string | null }) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [said, setSaid] = useState<string | null>(null);
  /* With no handle to hand (the account reads all failed), anything
     typed may be sent: the server compares it with the real one and
     answers "handle-mismatch" otherwise. */
  const bare = typed.trim().replace(/^@/, "").toLowerCase();
  const matches = handle === null ? bare.length > 0 : bare === handle.toLowerCase();

  return (
    <Card>
      <Title>Delete your account</Title>
      <Body>
        {"Everything goes: your profile, Flares, hunts, binders, showcase, trade history, Embers and unlocks. There is no undo."}
      </Body>
      <Muted>
        Pro through the App Store is billed by Apple: cancel it in your Apple ID
        subscriptions too, or it keeps renewing.
      </Muted>
      {open ? (
        <>
          <Body>
            {handle ? `Type your handle, @${handle}, to confirm.` : "Type your handle to confirm."}
          </Body>
          <Input
            value={typed}
            onChangeText={setTyped}
            placeholder={handle ? `@${handle}` : "@your_handle"}
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
                    : `The account could not be deleted. ${friendlyError(caught)}`,
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

/** A row on a settings card: a label, what it says, and a tap if any. */
function Row({
  label,
  value,
  onPress,
  accessibilityLabel,
}: {
  label: string;
  value?: string | null;
  onPress?: () => void;
  accessibilityLabel?: string;
}) {
  const body = (
    <View
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
      <Text style={{ color: colors.textPrimary, fontWeight: "700", flexShrink: 0 }}>
        {label}
      </Text>
      <View
        style={{ flexDirection: "row", alignItems: "center", gap: spacing(1), flexShrink: 1 }}
      >
        {value ? (
          <Text numberOfLines={1} style={{ color: colors.textMuted, flexShrink: 1 }}>
            {value}
          </Text>
        ) : null}
        {onPress ? (
          <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
        ) : null}
      </View>
    </View>
  );
  return onPress ? (
    <Tap accessibilityLabel={accessibilityLabel ?? label} onPress={onPress}>
      {body}
    </Tap>
  ) : (
    body
  );
}

/**
 * ACCOUNT: the sign-in email, the ZIP, and the version.
 *
 * This was a card that said email and password "live on the website" -
 * the app never showed which email you signed in with, and the website
 * says an email does not change without getting in touch. So it shows
 * it, and says how. The ZIP was reachable only from Home's Nearby card;
 * it is account housekeeping, so it is here too, saved the same way.
 * The version is for a bug report from a TestFlight build.
 */
function AccountCard({
  email,
  postalCode,
  onPostalCode,
}: {
  email: string | null;
  postalCode: string | null;
  onPostalCode: (zip: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [typed, setTyped] = useState(postalCode ?? "");
  const [said, setSaid] = useState<string | null>(null);

  const version = Constants.expoConfig?.version ?? "?";
  const build = Constants.expoConfig?.ios?.buildNumber;

  return (
    <Card>
      <Title>Account</Title>
      <Row label="Email" value={email ?? "Not available"} />
      <Muted>
        To change your email, get in touch below. Passwords reset from the sign-in screen.
      </Muted>

      {editing ? (
        <View style={{ gap: spacing(2) }}>
          <Input
            value={typed}
            onChangeText={(next) => {
              setTyped(next.replace(/\D/g, "").slice(0, 5));
              setSaid(null);
            }}
            placeholder="5-digit ZIP"
            keyboardType="number-pad"
            maxLength={5}
            accessibilityLabel="Your ZIP code"
          />
          <AsyncButton
            label={typed.length === 0 ? "Clear ZIP" : "Save ZIP"}
            pendingLabel="Saving…"
            disabled={typed.length !== 0 && typed.length !== 5}
            onPress={async () => {
              try {
                const result = await savePostalCode(typed);
                onPostalCode(result.postalCode);
                setEditing(false);
                setSaid(null);
              } catch (caught) {
                setSaid(friendlyError(caught));
              }
            }}
          />
          <Tap
            accessibilityLabel="Keep the ZIP"
            onPress={() => {
              setEditing(false);
              setTyped(postalCode ?? "");
              setSaid(null);
            }}
          >
            <Muted>Cancel</Muted>
          </Tap>
          {said ? <ErrorLine message={said} /> : null}
        </View>
      ) : (
        <Row
          label="ZIP code"
          value={postalCode ?? "Not set"}
          accessibilityLabel={`ZIP code, ${postalCode ?? "not set"}. Change it`}
          onPress={() => {
            setTyped(postalCode ?? "");
            setEditing(true);
          }}
        />
      )}

      <Row label="Version" value={build ? `${version} (${build})` : version} />
    </Card>
  );
}

/**
 * PRO: manage the subscription and restore it, from Settings as well as
 * the Pro screen. Apple bills it, so managing it is Apple's page; Restore
 * is the same call the Pro screen makes.
 */
function ProCard() {
  const [said, setSaid] = useState<string | null>(null);
  return (
    <Card>
      <Title>Pro</Title>
      {/* The same button as Restore under it: two actions, one shape. */}
      <Button
        label="Manage subscription"
        variant="secondary"
        onPress={() => void Linking.openURL(APPLE_SUBSCRIPTIONS_URL)}
      />
      <AsyncButton
        label="Restore purchases"
        pendingLabel="Restoring…"
        variant="secondary"
        onPress={async () => {
          setSaid(null);
          const outcome = await restorePro();
          setSaid(
            outcome.kind === "pro"
              ? "Pro restored. Welcome back."
              : outcome.kind === "none"
                ? "No Pro subscription found on this Apple ID."
                : outcome.kind === "claimed"
                  ? CLAIMED_MESSAGE
                  : outcome.kind === "unavailable"
                  ? "The App Store is not available right now. Try again later."
                  : `Restore did not finish: ${outcome.message}`,
          );
        }}
      />
      {said ? <Muted>{said}</Muted> : null}
    </Card>
  );
}

/** HELP: getting in touch, and the two pages App Review reads for. */
function HelpCard() {
  return (
    <Card>
      <Title>Help</Title>
      <Row label="Contact us" onPress={() => void Linking.openURL(`${API_BASE}/contact`)} />
      <Row label="Terms of use" onPress={() => void Linking.openURL(`${API_BASE}/terms`)} />
      <Row
        label="Privacy policy"
        onPress={() => void Linking.openURL(`${API_BASE}/privacy`)}
      />
    </Card>
  );
}
