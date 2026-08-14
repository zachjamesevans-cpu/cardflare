import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useCallback, useEffect, useState } from "react";
import { Image, Modal, Pressable, ScrollView, Text, View } from "react-native";

import type { StackParams } from "../../App";
import {
  addToShowcase,
  dressAllShowcase,
  dressShowcase,
  getProfile,
  removeFromShowcase,
  renameProfile,
  searchCards,
  signOut,
  storedAccessToken,
  type CardHit,
  type CosmeticItem,
  type Profile,
  type ShowcaseCard,
  type Wardrobe,
} from "../api";
import { CosmeticCard } from "../cosmetic-card";
import { DressingPicker, type DressingOption } from "../dressing-picker";
import { EmberBadge } from "../ember-badge";
import { PlayerAvatar } from "../player-avatar";
import { Body, Button, Card, Input, Muted, Tap, Title } from "../ui";
import { colors, radius, spacing } from "../theme";

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
export function ProfileScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<StackParams>>();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [wardrobe, setWardrobe] = useState<Wardrobe | null>(null);
  const [checked, setChecked] = useState(false);
  /* A token exists but the profile fetch failed: say so, never pretend
     the player is signed out. That lie cost a confused founder an hour. */
  const [loadFailed, setLoadFailed] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  /* The card whose dressing room is open, or null. */
  const [dressing, setDressing] = useState<ShowcaseCard | null>(null);

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
      setLoadFailed(false);
    } catch {
      setProfile(null);
      setLoadFailed(true);
    } finally {
      setChecked(true);
    }
  }, []);

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
            The connection to cardflare.gg did not go through. Check your signal and
            try again.
          </Body>
          <Button label="Try again" onPress={() => void load()} />
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
            same as always. Accounts are invite-only while CardFlare is in its pilot.
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

  const act = async (key: string, run: () => Promise<unknown>, said: string) => {
    setBusy(key);
    setMessage(null);
    try {
      await run();
      await load();
      setMessage(said);
    } catch {
      setMessage("That did not go through. Try again in a moment.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <ScrollView contentContainerStyle={{ padding: spacing(4), gap: spacing(4) }}>
      <Card>
        <View
          style={{
            flexDirection: "row",
            alignItems: "flex-start",
            justifyContent: "space-between",
          }}
        >
          <View style={{ flex: 1, gap: spacing(1) }}>
            <Text style={{ color: colors.textPrimary, fontWeight: "600", fontSize: 15 }}>
              You
            </Text>
            <Muted>Your picture and name travel with you between stores.</Muted>
          </View>
          {/* The cog. Everything the Account tab used to be. */}
          <Tap
            onPress={() => navigation.navigate("Settings")}
            style={{ padding: spacing(1) }}
          >
            <Ionicons name="settings-outline" size={22} color={colors.textSecondary} />
          </Tap>
        </View>

        <View style={{ alignItems: "center", gap: spacing(2) }}>
          {/* The ring is the AVATAR frame slot, separate from cards -
              the same component every roster row uses. */}
          <PlayerAvatar
            displayName={profile.displayName}
            seed={profile.playerId}
            avatarUrl={profile.avatarUrl}
            frame={profile.equipped.avatarFrame}
            size={96}
          />

          <Title>{profile.displayName}</Title>
          <EmberBadge earned={profile.embersEarned} size="md" />
        </View>

        {/*
         * Said out loud rather than shown as a disabled camera button.
         * Uploading a picture needs a multipart request, and this app's
         * writes deliberately ride in a header because bodies do not
         * survive the founder's network. A button that fails is worse
         * than a sentence that is true.
         */}
        <Muted>
          Change your picture at cardflare.gg on your profile page. It shows up here
          straight away.
        </Muted>

        <NameField
          current={profile.displayName}
          busy={busy === "rename"}
          onSave={(name) => act("rename", () => renameProfile(name), "Name updated.")}
        />
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
        <Title>Your showcase</Title>
        <Body>
          Up to nine cards you are proud of, wearing whatever you have unlocked.
          This is not a trade list, and nobody can pledge on it.
        </Body>

        {profile.showcase.length === 0 ? (
          <Muted>
            Nothing on the shelf yet. Search for a card below and it stays here
            between events.
          </Muted>
        ) : (
          /* The board's carousel: same card width, horizontal shelf. */
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: spacing(2), paddingVertical: spacing(1) }}
          >
            {profile.showcase.map((entry) => (
              <View key={entry.id} style={{ gap: spacing(1), width: 56 }}>
                {/* Tapping a card opens its dressing room, the
                    website's behaviour on your own shelf. */}
                <Tap onPress={() => setDressing(entry)}>
                  <CosmeticCard
                    imageUrl={entry.imageUrl}
                    width={56}
                    frame={entry.frame ?? profile.equipped.frame}
                    holo={entry.holo ?? profile.equipped.holo}
                    effect={profile.equipped.effect}
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
        defaults={profile.equipped}
        frames={ownedFrames}
        holos={ownedHolos}
        onClose={() => setDressing(null)}
        onDress={(entryId, frame, holo) =>
          void act(entryId, () => dressShowcase(entryId, frame, holo), "Saved.")
        }
        onDressAll={(frame, holo) =>
          void act(
            "dress-all",
            () => dressAllShowcase(frame, holo),
            "Every card updated.",
          )
        }
        effect={profile.equipped.effect}
      />

      <Button
        label="Sign out"
        variant="secondary"
        onPress={() => {
          void signOut().then(() => {
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
  return picked.map((word) => [...word][0] ?? "").join("").toUpperCase();
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

function NameField({
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
      <Muted>Display name</Muted>
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
  onPick,
}: {
  busy: boolean;
  frames: DressingOption[];
  holos: DressingOption[];
  defaultFrame: string | null;
  defaultHolo: string | null;
  effect: string | null;
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
  onClose,
  onDress,
  onDressAll,
}: {
  entry: ShowcaseCard | null;
  defaults: { frame: string | null; holo: string | null };
  frames: DressingOption[];
  holos: DressingOption[];
  effect: string | null;
  onClose: () => void;
  onDress: (entryId: string, frame: string | null, holo: string | null) => void;
  onDressAll: (frame: string | null, holo: string | null) => void;
}) {
  const [picked, setPicked] = useState<{ frame: string | null; holo: string | null }>({
    frame: null,
    holo: null,
  });

  /* Reset the picks whenever a different card's room opens. */
  useEffect(() => {
    if (entry) {
      setPicked({
        frame: entry.frame ?? defaults.frame,
        holo: entry.holo ?? defaults.holo,
      });
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
              onDress(entry.id, next.frame, next.holo);
            }}
          />

          <Button
            label="Apply to all cards"
            variant="secondary"
            onPress={() => onDressAll(picked.frame, picked.holo)}
          />
          <Muted>
            Every card on your shelf wears this border and holo, and new cards will
            too.
          </Muted>
          <Button label="Done" onPress={onClose} />
        </Pressable>
      </Pressable>
    </Modal>
  );
}
