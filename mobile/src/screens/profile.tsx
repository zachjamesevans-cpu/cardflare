import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useCallback, useEffect, useState } from "react";
import { Image, ScrollView, Text, View } from "react-native";

import type { StackParams } from "../../App";
import {
  addToShowcase,
  buyCosmetic,
  getProfile,
  removeFromShowcase,
  renameProfile,
  searchCards,
  signOut,
  storedAccessToken,
  type CardHit,
  type CosmeticItem,
  type Profile,
  type Wardrobe,
} from "../api";
import { CosmeticCard } from "../cosmetic-card";
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
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

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
    } catch {
      setProfile(null);
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
          <Muted>Your profile</Muted>
          {/* The cog. Everything the Account tab used to be. */}
          <Tap
            onPress={() => navigation.navigate("Settings")}
            style={{ padding: spacing(1) }}
          >
            <Ionicons name="settings-outline" size={22} color={colors.textSecondary} />
          </Tap>
        </View>

        <View style={{ alignItems: "center", gap: spacing(2) }}>
          {profile.avatarUrl ? (
            <Image
              source={{ uri: profile.avatarUrl }}
              style={{
                width: 96,
                height: 96,
                borderRadius: 48,
                borderWidth: 1,
                borderColor: colors.border,
              }}
            />
          ) : (
            <View
              style={{
                width: 96,
                height: 96,
                borderRadius: 48,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.elevated,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text
                style={{ color: colors.textSecondary, fontSize: 30, fontWeight: "700" }}
              >
                {initials(profile.displayName)}
              </Text>
            </View>
          )}

          <Title>{profile.displayName}</Title>
          <EmberChip earned={profile.embersEarned} />
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
            note="Public. This is your badge."
          />
          <Stat
            label="Left to spend"
            value={profile.embersBalance}
            note="Private. Only you see this."
            accent
          />
        </View>

      </Card>

      <Card>
        <Title>Your showcase</Title>
        <Body>
          Cards you are proud of, wearing whatever you have unlocked. Not a trade
          list, so nobody can pledge on these.
        </Body>

        {profile.showcase.length === 0 ? (
          <Muted>Nothing on the shelf yet. Search below and it stays here.</Muted>
        ) : (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing(3) }}>
            {profile.showcase.map((entry) => (
              <View key={entry.id} style={{ gap: spacing(1), width: 92 }}>
                <CosmeticCard
                  imageUrl={entry.imageUrl}
                  width={92}
                  frame={profile.equipped.frame}
                  holo={profile.equipped.holo}
                  effect={profile.equipped.effect}
                />
                <Text
                  numberOfLines={1}
                  style={{ color: colors.textSecondary, fontSize: 12 }}
                >
                  {entry.name}
                </Text>
                <Button
                  label="Remove"
                  variant="secondary"
                  busy={busy === entry.id}
                  onPress={() =>
                    void act(
                      entry.id,
                      () => removeFromShowcase(entry.id),
                      "Taken off the shelf.",
                    )
                  }
                />
              </View>
            ))}
          </View>
        )}

        {profile.showcase.length < profile.showcaseLimit ? (
          <AddToShowcase
            busy={busy === "showcase-add"}
            onPick={(cardId, printingId) =>
              void act(
                "showcase-add",
                () => addToShowcase(cardId, printingId),
                "On the shelf.",
              )
            }
          />
        ) : (
          <Muted>Your shelf is full. Remove one to make room.</Muted>
        )}
      </Card>

      {wardrobe && (
        <Card>
          <Title>What Embers buy</Title>
          <Body>Frames, holo patterns and effects for the cards on your shelf.</Body>

          <Slot
            heading="Frames"
            items={wardrobe.frames}
            balance={profile.embersBalance}
            busy={busy}
            onPick={(item) =>
              void act(item.slug, () => buyCosmetic(item.slug), `${item.name} equipped.`)
            }
          />
          <Slot
            heading="Holo patterns"
            items={wardrobe.holos}
            balance={profile.embersBalance}
            busy={busy}
            onPick={(item) =>
              void act(item.slug, () => buyCosmetic(item.slug), `${item.name} equipped.`)
            }
          />
          <Slot
            heading="Effects"
            items={wardrobe.effects}
            balance={profile.embersBalance}
            busy={busy}
            onPick={(item) =>
              void act(item.slug, () => buyCosmetic(item.slug), `${item.name} equipped.`)
            }
          />
        </Card>
      )}

      {message && <Muted>{message}</Muted>}

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

/* The number and the word "Embers", nothing else. Tier names read as a
   second currency, which is how the founder read them. */
function EmberChip({ earned }: { earned: number }) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: spacing(1.5),
        borderRadius: 999,
        borderWidth: 1,
        borderColor: colors.accent,
        paddingHorizontal: spacing(3),
        paddingVertical: spacing(1),
      }}
    >
      <Ionicons name="flame" size={14} color={colors.accent} />
      <Text style={{ color: colors.accent, fontWeight: "700" }}>
        {`${earned.toLocaleString()} Embers`}
      </Text>
    </View>
  );
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
      <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: "600" }}>
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

/**
 * One row of the shop.
 *
 * Everything shows, owned or not, priced or locked. A shop that hides
 * what you cannot afford leaves a new player with three free items and
 * no reason to trade again, which is the opposite of the point.
 */
function Slot({
  heading,
  items,
  balance,
  busy,
  onPick,
}: {
  heading: string;
  items: CosmeticItem[];
  balance: number;
  busy: string | null;
  onPick: (item: CosmeticItem) => void;
}) {
  return (
    <View style={{ gap: spacing(2) }}>
      <Text style={{ color: colors.textPrimary, fontWeight: "700" }}>{heading}</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing(2) }}>
        {items.map((item) => {
          const locked = item.lockedUntil !== null && !item.owned;
          const affordable = item.owned || (!locked && balance >= item.cost);

          return (
            <Tap
              key={item.slug}
              disabled={item.equipped || !affordable || busy !== null}
              onPress={() => onPick(item)}
              style={{
                flexBasis: "48%",
                flexGrow: 1,
                borderRadius: radius.control,
                borderWidth: 1,
                borderColor: item.equipped ? colors.accent : colors.border,
                backgroundColor: colors.elevated,
                padding: spacing(3),
                gap: spacing(1),
                opacity: affordable ? 1 : 0.55,
              }}
            >
              <Text style={{ color: colors.textPrimary, fontWeight: "700" }}>
                {item.name}
              </Text>
              <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                {item.description}
              </Text>
              <Text
                style={{
                  color: item.equipped ? colors.accent : colors.textSecondary,
                  fontSize: 12,
                  fontWeight: "600",
                }}
              >
                {item.equipped
                  ? "Equipped"
                  : item.owned
                    ? "Tap to wear"
                    : locked
                      ? `Needs ${item.lockedUntil?.toLocaleString()} earned`
                      : `${item.cost.toLocaleString()} Embers`}
              </Text>
            </Tap>
          );
        })}
      </View>
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
  onPick,
}: {
  busy: boolean;
  onPick: (cardId: string, printingId: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<CardHit[]>([]);

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
            onPick(hit.id, hit.basePrintingId);
            setOpen(false);
            setQuery("");
            setHits([]);
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
