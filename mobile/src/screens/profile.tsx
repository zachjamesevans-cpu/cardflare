import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { useCallback, useEffect, useRef, useState } from "react";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";

import type { StackParams } from "../../App";
import { cachedPlayerId, readCache, writeCache } from "../cache";
import {
  formatHandle,
  HANDLE_MAX,
  HANDLE_MIN,
  handleSeedFrom,
  handleWhileTyping,
} from "../handle";
import {
  addToShowcase,
  chooseUsername,
  describeError,
  dressAllShowcase,
  dressShowcase,
  getFollowing,
  getProfile,
  removeFromShowcase,
  renameProfile,
  searchCards,
  signOut,
  storedAccessToken,
  uploadAvatar,
  type CardHit,
  type CosmeticItem,
  type FollowedPlayer,
  type Profile,
  type ShowcaseCard,
  type Wardrobe,
} from "../api";
import { CosmeticCard } from "../cosmetic-card";
import { DressingPicker, type DressingOption } from "../dressing-picker";
import { EmberBadge } from "../ember-badge";
import { PlayerAvatar } from "../player-avatar";
import { WornBadge, WornName, WornTitle } from "../worn-name";
import { CoverBanner } from "../showcase-zoom";
import {
  AsyncButton,
  Body,
  Button,
  Card,
  HandleInput,
  Input,
  Muted,
  Tap,
  Title,
} from "../ui";
import { colors, radius, spacing } from "../theme";

/** How far the cover reaches: past the name and the Embers badge. */
const COVER_HEIGHT = 280;

/**
 * The Profile tab, which used to be Account.
 *
 * The founder's call, and it holds up: an account page is housekeeping,
 * and housekeeping is not somewhere anybody visits twice. This is who
 * you are, what you have earned, and what you are showing off, with the
 * old account screen one tap away behind the cog.
 *
 * The two Ember numbers are laid out exactly as on the website. Lifetime
 * earned is the badge and it is public; the balance sits beside the shop
 * and nowhere else. The endpoint behind this screen only ever answers
 * for the signed-in player, which is what makes showing the balance here
 * safe: there is no way to point it at somebody else.
 *
 * Guests see the honest pitch rather than a wall: the whole room loop
 * works without any of this, and always will.
 */
/**
 * What a profile looks like on disk between visits.
 *
 * The three pieces the screen paints with, and deliberately not
 * `following` — a follow list is small, fast, and the one thing on this
 * screen somebody might change from another device. It loads normally.
 */
interface CachedProfile {
  profile: Profile;
  wardrobe: Wardrobe | null;
  needsSetup: boolean;
}

export function ProfileScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<StackParams>>();

  const [profile, setProfile] = useState<Profile | null>(null);
  /* Read inside `load`, which is a stable useCallback — its closure
     would otherwise hold whatever `profile` was at mount. */
  const profileRef = useRef<Profile | null>(null);
  const [wardrobe, setWardrobe] = useState<Wardrobe | null>(null);
  const [checked, setChecked] = useState(false);
  /* A fresh account finishes choosing a name before anything else -
     the website's /welcome/username, in place. */
  const [needsSetup, setNeedsSetup] = useState(false);
  /* A token exists but the profile fetch failed: say so WITH the error's
     name, never pretend the player is signed out. The generic version of
     this screen cost days of blind debugging; the named version makes a
     screenshot of the failure the diagnosis. Null = no failure. */
  const [loadFailed, setLoadFailed] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  /* The card whose dressing room is open, or null. */
  const [dressing, setDressing] = useState<ShowcaseCard | null>(null);

  /* Who you follow - fetched with the profile, shown as People. */
  const [following, setFollowing] = useState<FollowedPlayer[]>([]);

  /* The showcase explainer, folded behind its "?". */
  const [showcaseHelp, setShowcaseHelp] = useState(false);

  const load = useCallback(async () => {
    const token = await storedAccessToken();
    if (!token) {
      setProfile(null);
      setChecked(true);
      return;
    }
    try {
      const result = await getProfile();
      setProfile(result.profile);
      setWardrobe(result.wardrobe);
      setNeedsSetup(result.needsSetup);
      setLoadFailed(null);

      /* Remembered for the next open. Written only after a load that
         worked, so the cache can only ever hold a profile that was
         real. See cache.ts. */
      void writeCache("profile", result.profile.playerId, {
        profile: result.profile,
        wardrobe: result.wardrobe,
        needsSetup: result.needsSetup,
      } satisfies CachedProfile);

      getFollowing()
        .then((people) => setFollowing(people.following))
        .catch(() => {});
    } catch (caught) {
      /*
       * A failed load no longer empties a screen that already has
       * something on it. Blanking a profile somebody can see because
       * the network blinked takes content away rather than adding it
       * late, which is the complaint in its worst form.
       */
      if (!profileRef.current) {
        setProfile(null);
        setLoadFailed(describeError(caught));
      }
    } finally {
      setChecked(true);
    }
  }, []);

  /*
   * Last visit's profile, painted before this one has loaded.
   *
   * The founder: "it takes a full 7 seconds to load the full profile,
   * such as card frames, effects, etc." The wardrobe is the heavy part
   * and it is also the part that almost never changes between two
   * visits, so it is exactly what a cache is for.
   *
   * Once, on first mount, and only if it wins the race with the
   * network — painting over something fresher would be worse than not
   * painting at all.
   */
  useEffect(() => {
    let live = true;

    void (async () => {
      if (!(await storedAccessToken())) return;

      const id = await cachedPlayerId();
      if (!id || !live) return;

      const cached = await readCache<CachedProfile>("profile", id);
      if (!cached || !live || profileRef.current) return;

      setProfile(cached.profile);
      setWardrobe(cached.wardrobe);
      setNeedsSetup(cached.needsSetup);
      setChecked(true);
    })();

    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    profileRef.current = profile;
  }, [profile]);

  useFocusEffect(
    useCallback(() => {
      let live = true;
      void (async () => {
        await load();
        if (!live) return;
      })();
      return () => {
        live = false;
      };
    }, [load]),
  );

  /**
   * Pick, shrink, convert, send. Everything lands as a JPEG well under
   * 200KB regardless of what the camera roll held - the founder's brief:
   * it must work first time and it must not be a server load.
   */
  const changePicture = async (kind: "avatar" | "cover" = "avatar") => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setMessage("cardflare needs photo access to change your picture.");
      return;
    }

    const chosen = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      /* The crop the server will make anyway, offered up front. */
      aspect: kind === "cover" ? [8, 3] : [1, 1],
      quality: 1,
    });
    if (chosen.canceled || chosen.assets.length === 0) return;

    setBusy(kind);
    setMessage("Preparing picture…");
    try {
      /* Resize to the stored size and re-encode as JPEG, walking the
         quality down until it is comfortably small. Base64 length is a
         fine proxy: 200000 characters is roughly 150KB of image. */
      let quality = 0.8;
      let encoded: string | null = null;
      while (quality >= 0.2) {
        const out = await manipulateAsync(
          chosen.assets[0].uri,
          [{ resize: { width: kind === "cover" ? 1200 : 512 } }],
          { compress: quality, format: SaveFormat.JPEG, base64: true },
        );
        encoded = out.base64 ?? null;
        if (encoded && encoded.length <= (kind === "cover" ? 300_000 : 200_000)) break;
        quality -= 0.15;
      }
      if (!encoded) {
        setMessage("That picture could not be read. Try a different one.");
        return;
      }

      await uploadAvatar(
        encoded,
        (sent, total) => setMessage(`Uploading picture… ${sent} of ${total}`),
        kind,
      );
      await load();
      setMessage(kind === "cover" ? "Cover updated." : "Picture updated.");
    } catch (caught) {
      setMessage(
        `The picture did not go through (${describeError(caught)}). Try again.`,
      );
    } finally {
      setBusy(null);
    }
  };

  /**
   * The animated picture: a GIF, sent as it was picked.
   *
   * Deliberately not the flow above. That one resizes and re-encodes to
   * a JPEG, which is exactly the thing that turns an animation into one
   * frame of an animation - so a GIF cannot go through it and there was
   * no other way in. No crop either: the editor hands back a still.
   *
   * The size ceiling is the transport's, not the format's. Every 6KB of
   * GIF is another request, so this is a couple of hundred of them at
   * 2MB, counted out loud while they go. The website takes larger ones
   * because a browser can send a body and this cannot.
   */
  const changeAnimatedPicture = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setMessage("cardflare needs photo access to change your picture.");
      return;
    }

    const chosen = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      /* No editing: cropping re-encodes, and a re-encoded GIF is a JPEG
         of its first frame. The server squares it instead. */
      allowsEditing: false,
      quality: 1,
      base64: true,
    });
    if (chosen.canceled || chosen.assets.length === 0) return;

    const asset = chosen.assets[0];
    const looksAnimated =
      asset.mimeType === "image/gif" || /\.gif($|\?)/i.test(asset.uri);

    if (!looksAnimated) {
      setMessage("An animated picture has to be a GIF.");
      return;
    }

    const encoded = asset.base64 ?? null;
    if (!encoded) {
      setMessage("That GIF could not be read. Try a different one.");
      return;
    }

    /* Said before the wait rather than after it: base64 is four
       characters per three bytes, so this is the real file size. */
    if (encoded.length > 2_800_000) {
      setMessage("That GIF is over 2MB. Try a shorter or smaller one.");
      return;
    }

    setBusy("avatar");
    setMessage("Uploading GIF…");
    try {
      await uploadAvatar(
        encoded,
        (sent, total) => setMessage(`Uploading GIF… ${sent} of ${total}`),
        "avatar-animated",
      );
      await load();
      setMessage("Animated picture updated.");
    } catch (caught) {
      setMessage(`The GIF did not go through (${describeError(caught)}). Try again.`);
    } finally {
      setBusy(null);
    }
  };

  const act = async (
    key: string,
    run: () => Promise<unknown>,
    said: string,
  ): Promise<boolean> => {
    setBusy(key);
    setMessage(null);
    try {
      await run();
      await load();
      setMessage(said);
      return true;
    } catch (caught) {
      setMessage(
        `That did not go through (${describeError(caught)}). Try again in a moment.`,
      );
      return false;
    } finally {
      setBusy(null);
    }
  };

  if (!checked) {
    return (
      <ScrollView contentContainerStyle={{ padding: spacing(4) }}>
        <Muted>Loading…</Muted>
      </ScrollView>
    );
  }

  if (!profile && loadFailed) {
    return (
      <ScrollView contentContainerStyle={{ padding: spacing(4), gap: spacing(4) }}>
        <Card>
          <Title>Signed in, but your profile could not load</Title>
          <Body>
            The connection to cardflare.gg did not go through. Check your signal and try
            again.
          </Body>
          <Muted>What the server said: {loadFailed}</Muted>
          <AsyncButton
            label="Try again"
            pendingLabel="Retrying…"
            onPress={() => load()}
          />
        </Card>
      </ScrollView>
    );
  }

  if (profile && needsSetup) {
    return (
      <ScrollView contentContainerStyle={{ padding: spacing(4), gap: spacing(4) }}>
        <Card>
          <Title>Pick your name</Title>
          <Body>
            This is the name people see next to everything you post. Spaces and
            capitals are fine, and it does not have to be unique.
          </Body>
          <NameField
            current={profile.displayName}
            busy={busy === "setup"}
            onSave={(name) =>
              act(
                "setup",
                /* The handle is derived here rather than asked for
                   twice: this screen is the fallback path for somebody
                   who reached the profile tab before finishing setup,
                   and the welcome flow is where both are chosen. It can
                   be changed in Settings straight after. */
                () => chooseUsername(name, handleSeedFrom(name)),
                "Welcome to cardflare.",
              )
            }
          />
          {message && <Muted>{message}</Muted>}
        </Card>
      </ScrollView>
    );
  }

  if (!profile) {
    return (
      <ScrollView contentContainerStyle={{ padding: spacing(4), gap: spacing(4) }}>
        <Card>
          <Title>Have an account?</Title>
          <Body>
            Sign in and your profile follows you between stores: your picture, your
            Embers, and the cards you are showing off.
          </Body>
          <Button label="Sign in" onPress={() => navigation.navigate("SignIn")} />
        </Card>
        <Card>
          <Body>
            No account? Nothing changes. Scan any counter code and trade as a guest,
            same as always. Accounts are invite-only while cardflare is in its pilot.
          </Body>
        </Card>
      </ScrollView>
    );
  }

  /* What the dressing rooms may offer: owned only, free items included. */
  const ownedFrames: DressingOption[] = (wardrobe?.cardFrames ?? [])
    .filter((item) => item.owned)
    .map(({ slug, name }) => ({ slug, name }));
  const ownedHolos: DressingOption[] = (wardrobe?.holos ?? [])
    .filter((item) => item.owned)
    .map(({ slug, name }) => ({ slug, name }));

  return (
    <ScrollView contentContainerStyle={{ padding: spacing(4), gap: spacing(4) }}>
      {/* Your own profile block, laid out exactly as View full profile
          shows anyone else - same cover, same picture, same centered
          name and badge, same shelf, with the edit controls added.
          The founder's rule: what you see is what they see. */}
      <Card style={{ paddingTop: spacing(6), overflow: "hidden" }}>
        {/* The cover carries down behind the picture, the name and the
            badge, then fades into the card. No seam: the founder's
            mockup, and the same shape the website draws. */}
        <CoverBanner coverUrl={profile.coverUrl} height={COVER_HEIGHT} fade />

        {/*
         * The block's two controls, riding its corner: the wand
         * dresses the profile, the cog is everything the Account tab
         * used to be. Same spots as the website.
         */}
        <View
          style={{
            position: "absolute",
            top: spacing(3),
            right: spacing(3),
            flexDirection: "row",
            gap: spacing(2),
          }}
        >
          <Tap
            onPress={() => navigation.navigate("Customize", { area: "profile" })}
            accessibilityLabel="Customize your profile"
            style={{
              width: 40,
              height: 40,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.surface,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Ionicons name="color-wand" size={20} color={colors.textSecondary} />
          </Tap>
          <Tap
            onPress={() => navigation.navigate("Settings")}
            accessibilityLabel="Settings"
            style={{
              width: 40,
              height: 40,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.surface,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Ionicons name="settings-outline" size={20} color={colors.textSecondary} />
          </Tap>
        </View>

        {/*
         * No negative margin here, and that IS the fix.
         *
         * This carried `marginTop: 96 - 48 - (110 + spacing(2))` — minus
         * seventy pixels — left over from a layout where something 110
         * tall sat above it. The cover is `position: absolute` now, so
         * this column is the card's FIRST in-flow child: seventy pixels
         * up from a twenty-four pixel padding put the picture's top edge
         * forty-six pixels above the card, and the card clips its
         * overflow. Half of everybody's face was cut off.
         *
         * The block a player sees of somebody else never had the margin,
         * which is how the two drifted apart. They match again now,
         * which is the founder's own rule for this screen: what you see
         * is what they see.
         */}
        <View
          style={{
            alignItems: "center",
            gap: spacing(2),
          }}
        >
          <PlayerAvatar
            displayName={profile.displayName}
            seed={profile.playerId}
            avatarUrl={profile.avatarUrl}
            frame={profile.equipped.avatarFrame}
            ring={profile.wear?.ring ?? null}
            aura={profile.wear?.aura ?? null}
            ringArt={profile.wear?.ringArt ?? null}
            auraArt={profile.wear?.auraArt ?? null}
            size={96}
          />
          {/* The name wearing its style, the badge beside it, the
              title under - the website's WornNameRow, natively. */}
          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing(2) }}>
            <WornName
              name={profile.displayName}
              nameplate={profile.equips?.nameplate}
              baseStyle={{ color: colors.textPrimary, fontSize: 22, fontWeight: "800" }}
            />
            <WornBadge badge={profile.equips?.badge} />
          </View>
          <WornTitle title={profile.equips?.title} />
          <EmberBadge earned={profile.embersEarned} size="md" />
        </View>

        {/*
         * Picture, cover and name, editable right where they show -
         * the founder's call after the separate edit block read as a
         * duplicate: "it should all go live from the actual edit
         * button... everything can be changed up top."
         *
         * A real upload: the picture is resized and re-compressed to a
         * small JPEG on the phone, then rides the header transport in
         * chunks. The button narrates each stage because a dozen small
         * requests on shop wifi takes a visible moment.
         */}
        <View style={{ flexDirection: "row", gap: spacing(2) }}>
          <View style={{ flex: 1 }}>
            <Button
              label={busy === "avatar" ? (message ?? "Uploading…") : "Change picture"}
              variant="secondary"
              disabled={busy === "avatar" || busy === "cover"}
              onPress={() => void changePicture("avatar")}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Button
              label={busy === "cover" ? (message ?? "Uploading…") : "Change cover"}
              variant="secondary"
              disabled={busy === "avatar" || busy === "cover"}
              onPress={() => void changePicture("cover")}
            />
          </View>
        </View>

        {/*
         * The GIF, on its own line and its own flow. It cannot share the
         * button above: that one resizes and re-encodes to a JPEG, which
         * is what turns an animation into one frame of an animation.
         *
         * Offered to everybody rather than hidden behind the tier. The
         * server refuses a non-Pro upload by name, and a button that
         * says what it is teaches the feature exists; a button that is
         * simply absent teaches nothing.
         */}
        <Button
          label={busy === "avatar" ? (message ?? "Uploading…") : "Use a GIF (Pro)"}
          variant="secondary"
          disabled={busy === "avatar" || busy === "cover"}
          onPress={() => void changeAnimatedPicture()}
        />

        {/* The one showcase, editable in place: tap a card to dress
            it, remove below it, add at the end. The wand carries the
            shelf's cosmetics in a menu of its own. Its own rounded
            panel inside the block, same as the website. */}
        <View
          style={{
            gap: spacing(2),
            borderRadius: radius.control,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.elevated,
            padding: spacing(3),
          }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              gap: spacing(2),
            }}
          >
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: spacing(1.5) }}
            >
              <Text
                style={{ color: colors.textPrimary, fontWeight: "700", fontSize: 13 }}
              >
                Your showcase
              </Text>
              <Tap
                onPress={() => setShowcaseHelp((open) => !open)}
                accessibilityLabel="What is a showcase?"
                hitSlop={8}
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: showcaseHelp ? colors.accent : colors.border,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text
                  style={{
                    color: showcaseHelp ? colors.accent : colors.textMuted,
                    fontSize: 12,
                    fontWeight: "700",
                  }}
                >
                  ?
                </Text>
              </Tap>
            </View>
            <Tap
              onPress={() => navigation.navigate("Customize", { area: "showcase" })}
              accessibilityLabel="Customize your showcase"
              style={{
                width: 40,
                height: 40,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.elevated,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Ionicons name="color-wand" size={20} color={colors.textSecondary} />
            </Tap>
          </View>
          {/* The explanation read as clutter once you knew it - the
              founder's call. It folds behind the "?" now: there for the
              first visit, gone for every visit after. Same fold as the
              website's. */}
          {showcaseHelp && (
            <Muted>
              Up to nine cards you are proud of. Tap a card to dress it. Not a trade
              list, so nobody can pledge on it.
            </Muted>
          )}

          {profile.showcase.length === 0 ? (
            <Muted>
              Nothing on the shelf yet. Search for a card below and it stays here
              between events.
            </Muted>
          ) : (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: spacing(2), paddingVertical: spacing(1) }}
            >
              {profile.showcase.map((entry) => (
                <View key={entry.id} style={{ gap: spacing(1), width: 56 }}>
                  <Tap onPress={() => setDressing(entry)}>
                    <CosmeticCard
                      imageUrl={entry.imageUrl}
                      width={56}
                      frame={entry.frame ?? profile.equipped.frame}
                      holo={entry.holo ?? profile.equipped.holo}
                      effect={profile.equipped.effect}
                      border={profile.equips?.border ?? null}
                    />
                  </Tap>
                  <Text
                    numberOfLines={1}
                    style={{ color: colors.textSecondary, fontSize: 11 }}
                  >
                    {entry.name}
                  </Text>
                  <Tap
                    disabled={busy === entry.id}
                    onPress={() =>
                      void act(
                        entry.id,
                        () => removeFromShowcase(entry.id),
                        "Taken off the shelf.",
                      )
                    }
                  >
                    <Text
                      style={{
                        color: colors.textMuted,
                        fontSize: 11,
                        textDecorationLine: "underline",
                      }}
                    >
                      Remove
                    </Text>
                  </Tap>
                </View>
              ))}
            </ScrollView>
          )}

          {profile.showcase.length < profile.showcaseLimit ? (
            <AddToShowcase
              busy={busy === "showcase-add"}
              frames={ownedFrames}
              holos={ownedHolos}
              defaultFrame={profile.equipped.frame}
              defaultHolo={profile.equipped.holo}
              effect={profile.equipped.effect}
              border={profile.equips?.border ?? null}
              onPick={(cardId, printingId, picks) =>
                void act(
                  "showcase-add",
                  () => addToShowcase(cardId, printingId, picks),
                  "On the shelf.",
                )
              }
            />
          ) : (
            <Muted>Your shelf is full. Remove one to make room.</Muted>
          )}
        </View>
      </Card>

      <Card>
        <Title>Embers</Title>
        <Body>Earned by confirming trades, and nothing else.</Body>

        <View style={{ flexDirection: "row", gap: spacing(3) }}>
          <Stat
            label="Earned, all time"
            value={profile.embersEarned}
            note="Public. This is the number on your badge, and it never goes down."
          />
          <Stat
            label="Left to spend"
            value={profile.embersBalance}
            note="Private. Nobody else sees this, only you."
            accent
          />
        </View>
      </Card>

      <Card>
        <Title>People</Title>
        <Body>
          Players you follow. When they follow you back, you are Trade partners. Follow
          people from their profile popup in a room, or find them in the search bar.
        </Body>

        {following.length === 0 ? (
          <Muted>
            Nobody yet. The next time somebody impresses you at a table, tap their name.
          </Muted>
        ) : (
          <View>
            {following.map((person, index) => (
              <Tap
                key={person.playerId}
                onPress={() =>
                  navigation.navigate("PlayerProfile", { playerId: person.playerId })
                }
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: spacing(3),
                  paddingVertical: spacing(2.5),
                  borderTopWidth: index === 0 ? 0 : 1,
                  borderTopColor: colors.border,
                }}
              >
                <PlayerAvatar
                  displayName={person.displayName}
                  seed={person.playerId}
                  avatarUrl={person.avatarUrl}
                  frame={person.frame}
                  size={32}
                />
                <Text
                  numberOfLines={1}
                  style={{ color: colors.textPrimary, fontWeight: "600", flex: 1 }}
                >
                  {person.displayName}
                </Text>
                {person.partners && (
                  <Text style={{ color: colors.accent, fontSize: 12 }}>
                    Trade partners
                  </Text>
                )}
              </Tap>
            ))}
          </View>
        )}
      </Card>

      {/*
       * The store lives on its own screen now, same as the website:
       * this card is the door, wearing the one number a shopper
       * decides with.
       */}
      <Tap
        onPress={() => navigation.navigate("Store")}
        style={{
          backgroundColor: colors.surface,
          borderColor: colors.border,
          borderWidth: 1,
          borderRadius: radius.card,
          padding: spacing(4),
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: spacing(2),
        }}
      >
        <View style={{ flex: 1, gap: spacing(1) }}>
          <Text style={{ color: colors.textPrimary, fontWeight: "600", fontSize: 15 }}>
            Embers store
          </Text>
          <Muted>Frames, holo patterns and effects. Spend what you have earned.</Muted>
        </View>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: spacing(1.5),
            borderRadius: 999,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.elevated,
            paddingHorizontal: spacing(3),
            paddingVertical: spacing(1),
          }}
        >
          <Ionicons name="flame" size={13} color={colors.accent} />
          <Text style={{ color: colors.accent, fontWeight: "700", fontSize: 13 }}>
            {profile.embersBalance.toLocaleString()}
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: 12 }}>to spend</Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
      </Tap>

      {message && <Muted>{message}</Muted>}

      <DressModal
        entry={dressing}
        border={profile.equips?.border ?? null}
        defaults={profile.equipped}
        frames={ownedFrames}
        holos={ownedHolos}
        onClose={() => setDressing(null)}
        onDress={(entryId, frame, holo) =>
          void act(entryId, () => dressShowcase(entryId, frame, holo), "Saved.")
        }
        onDressAll={(frame, holo) =>
          act("dress-all", () => dressAllShowcase(frame, holo), "Every card updated.")
        }
        effect={profile.equipped.effect}
      />

      <AsyncButton
        label="Sign out"
        pendingLabel="Signing out…"
        variant="secondary"
        onPress={() => {
          return signOut().then(() => {
            setProfile(null);
            setWardrobe(null);
          });
        }}
      />
    </ScrollView>
  );
}

/** Up to two initials, the same fallback the website draws. */
function initials(displayName: string): string {
  const words = displayName.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  const picked = words.length === 1 ? [words[0]] : [words[0], words[words.length - 1]];
  return picked
    .map((word) => [...word][0] ?? "")
    .join("")
    .toUpperCase();
}

function Stat({
  label,
  value,
  note,
  accent = false,
}: {
  label: string;
  value: number;
  note: string;
  accent?: boolean;
}) {
  return (
    <View
      style={{
        flex: 1,
        borderRadius: radius.control,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.elevated,
        padding: spacing(3),
        gap: spacing(1),
      }}
    >
      <Text
        style={{
          color: colors.textMuted,
          fontSize: 11,
          fontWeight: "600",
          letterSpacing: 0.6,
        }}
      >
        {label.toUpperCase()}
      </Text>
      <Text
        style={{
          color: accent ? colors.accent : colors.textPrimary,
          fontSize: 22,
          fontWeight: "700",
        }}
      >
        {value.toLocaleString()}
      </Text>
      <Text style={{ color: colors.textMuted, fontSize: 11 }}>{note}</Text>
    </View>
  );
}

export function NameField({
  current,
  busy,
  onSave,
}: {
  current: string;
  busy: boolean;
  onSave: (name: string) => void;
}) {
  const [value, setValue] = useState(current);

  return (
    <View style={{ gap: spacing(2) }}>
      <Input
        value={value}
        onChangeText={setValue}
        maxLength={40}
        autoCapitalize="words"
        placeholder="What people call you"
      />
      <Button
        label="Save"
        variant="secondary"
        busy={busy}
        disabled={value.trim().length === 0 || value.trim() === current}
        onPress={() => onSave(value.trim())}
      />
    </View>
  );
}

/**
 * The handle, changed on its own.
 *
 * Separate from the name for the same reason it is separate on the
 * website: only one of the two can come back "taken", and one message
 * trying to explain both situations would explain neither.
 */
export function HandleField({
  current,
  busy,
  onSave,
}: {
  current: string;
  busy: boolean;
  onSave: (handle: string) => void;
}) {
  const [value, setValue] = useState(current);

  return (
    <View style={{ gap: spacing(2) }}>
      <HandleInput
        value={value}
        /* The TYPING shaper, so an underscore can actually be typed:
           the stored-handle one strips it the moment it lands. */
        onChangeText={(next) => setValue(handleWhileTyping(next))}
        maxLength={HANDLE_MAX}
        placeholder="steven_b"
      />
      <Button
        label="Save"
        variant="secondary"
        busy={busy}
        disabled={value.trim().length < HANDLE_MIN || value.trim() === current}
        onPress={() => onSave(value.trim())}
      />
    </View>
  );
}

/**
 * Putting a card on the shelf, from the phone.
 *
 * The same debounced search the post-flare screen uses, doing a
 * different job: a showcase is "this is what I am proud of", not "I will
 * let this go". Nothing here creates a Flare and nobody can pledge on
 * the result.
 *
 * Closed by default. Nine cards fit and most visits change none of them,
 * so a permanently open search would be the loudest thing on a screen
 * that is mostly for looking at.
 */
function AddToShowcase({
  busy,
  frames,
  holos,
  defaultFrame,
  defaultHolo,
  effect,
  border,
  onPick,
}: {
  busy: boolean;
  frames: DressingOption[];
  holos: DressingOption[];
  defaultFrame: string | null;
  defaultHolo: string | null;
  effect: string | null;
  /** The worn catalogue border, so the preview is the card they get. */
  border: string | null;
  onPick: (
    cardId: string,
    printingId: string | null,
    dressing: { frame: string | null; holo: string | null },
  ) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<CardHit[]>([]);

  /* The card chosen in step one, waiting to be dressed before it goes
     up - the founder's spec, same two steps as the website. */
  const [pending, setPending] = useState<{
    cardId: string;
    printingId: string | null;
    imageUrl: string | null;
  } | null>(null);
  const [picked, setPicked] = useState({ frame: defaultFrame, holo: defaultHolo });

  useEffect(() => {
    if (query.trim().length < 2) {
      setHits([]);
      return;
    }

    /* The same 300ms the post screen uses: long enough that a phone
       keyboard does not fire a query per character. */
    const timer = setTimeout(() => {
      void searchCards(query.trim())
        .then((result) => setHits(result.cards))
        .catch(() => setHits([]));
    }, 300);

    return () => clearTimeout(timer);
  }, [query]);

  if (!open) {
    return (
      <Button label="Add a card" variant="secondary" onPress={() => setOpen(true)} />
    );
  }

  if (pending) {
    return (
      <View style={{ gap: spacing(3) }}>
        <Text style={{ color: colors.textSecondary, fontSize: 13 }}>
          Dress it before it goes up
        </Text>

        {/* The card as it will land, wearing the picks live. */}
        <View style={{ alignItems: "center" }}>
          <CosmeticCard
            imageUrl={pending.imageUrl}
            width={160}
            frame={picked.frame}
            holo={picked.holo}
            effect={effect}
            border={border}
          />
        </View>

        <DressingPicker
          imageUrl={pending.imageUrl}
          frames={frames}
          holos={holos}
          frame={picked.frame}
          holo={picked.holo}
          effect={effect}
          onPick={setPicked}
        />

        <Button
          label="Add to showcase"
          busy={busy}
          onPress={() => {
            onPick(pending.cardId, pending.printingId, picked);
            setPending(null);
            setOpen(false);
            setQuery("");
            setHits([]);
          }}
        />
        <Button
          label="Pick a different card"
          variant="secondary"
          onPress={() => setPending(null)}
        />
      </View>
    );
  }

  return (
    <View style={{ gap: spacing(2) }}>
      <Input
        value={query}
        onChangeText={setQuery}
        autoFocus
        autoCorrect={false}
        placeholder="Search for a card"
      />

      {hits.slice(0, 8).map((hit) => (
        <Tap
          key={hit.id}
          disabled={busy}
          onPress={() => {
            /* The base printing, the website's rule. A card with no
               provider art goes up with no printing at all, which
               renders as the honest empty frame. */
            setPicked({ frame: defaultFrame, holo: defaultHolo });
            setPending({
              cardId: hit.id,
              printingId: hit.basePrintingId,
              imageUrl:
                hit.printings.find((printing) => printing.id === hit.basePrintingId)
                  ?.imageUrl ?? null,
            });
          }}
          style={{
            borderRadius: radius.control,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.elevated,
            padding: spacing(3),
          }}
        >
          <Text style={{ color: colors.textPrimary, fontWeight: "600" }}>
            {hit.name}
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: 12 }}>
            {hit.cardNumber}
          </Text>
        </Tap>
      ))}

      <Button label="Cancel" variant="secondary" onPress={() => setOpen(false)} />
    </View>
  );
}

/**
 * One card's dressing room - the website's editor, in a Modal.
 *
 * Every pick saves immediately, shop-style; Apply to all is the real
 * button, because it changes the rest of the shelf too. The preview
 * updates locally the instant a tile is tapped, and the reload behind
 * the save keeps the shelf underneath honest.
 */
function DressModal({
  entry,
  defaults,
  frames,
  holos,
  effect,
  border,
  onClose,
  onDress,
  onDressAll,
}: {
  entry: ShowcaseCard | null;
  defaults: { frame: string | null; holo: string | null };
  frames: DressingOption[];
  holos: DressingOption[];
  effect: string | null;
  /** The worn catalogue border, so the preview is the card they get. */
  border: string | null;
  onClose: () => void;
  onDress: (entryId: string, frame: string | null, holo: string | null) => void;
  /** Resolves true when the write landed, so the button can say so. */
  onDressAll: (frame: string | null, holo: string | null) => Promise<boolean>;
}) {
  const [picked, setPicked] = useState<{ frame: string | null; holo: string | null }>({
    frame: null,
    holo: null,
  });
  /* The Apply button narrates its own work: busy while saving, Saved!
     after, back to rest when the picks change. The founder's ask. */
  const [applyState, setApplyState] = useState<"idle" | "busy" | "saved" | "failed">(
    "idle",
  );

  /* Reset the picks whenever a different card's room opens. */
  useEffect(() => {
    if (entry) {
      setPicked({
        frame: entry.frame ?? defaults.frame,
        holo: entry.holo ?? defaults.holo,
      });
      setApplyState("idle");
    }
  }, [entry, defaults.frame, defaults.holo]);

  if (!entry) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        onPress={onClose}
        style={{
          flex: 1,
          backgroundColor: "rgba(0,0,0,0.75)",
          alignItems: "center",
          justifyContent: "center",
          padding: spacing(4),
        }}
      >
        <Pressable
          onPress={() => {}}
          style={{
            alignSelf: "stretch",
            borderRadius: radius.card,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.surface,
            padding: spacing(4),
            gap: spacing(3),
          }}
        >
          <Text
            numberOfLines={1}
            style={{ color: colors.textPrimary, fontWeight: "700", fontSize: 16 }}
          >
            {entry.name}
          </Text>

          <View style={{ alignItems: "center" }}>
            <CosmeticCard
              imageUrl={entry.imageUrl}
              width={150}
              frame={picked.frame}
              holo={picked.holo}
              effect={effect}
              border={border}
            />
          </View>

          <DressingPicker
            imageUrl={entry.imageUrl}
            frames={frames}
            holos={holos}
            frame={picked.frame}
            holo={picked.holo}
            effect={effect}
            onPick={(next) => {
              setPicked(next);
              setApplyState("idle");
              onDress(entry.id, next.frame, next.holo);
            }}
          />

          <Button
            label={
              applyState === "busy"
                ? "Applying…"
                : applyState === "saved"
                  ? "Saved!"
                  : applyState === "failed"
                    ? "Did not save. Try again."
                    : "Apply to all cards"
            }
            variant="secondary"
            disabled={applyState === "busy"}
            onPress={() => {
              setApplyState("busy");
              void onDressAll(picked.frame, picked.holo).then((landed) =>
                setApplyState(landed ? "saved" : "failed"),
              );
            }}
          />
          <Muted>
            Every card on your shelf wears this border and holo, and new cards will too.
          </Muted>
          <Button label="Done" onPress={onClose} />
        </Pressable>
      </Pressable>
    </Modal>
  );
}
