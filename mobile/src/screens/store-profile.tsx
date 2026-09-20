import { useCallback, useState } from "react";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Linking, ScrollView, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import type { StackParams } from "../../App";
import {
  claimStore,
  getStore,
  joinRoom,
  storedAccessToken,
  CLAIM_ROLES,
  type ClaimFields,
  type PublicStore,
} from "../api";
import { FollowStoreButton } from "../follow-store-button";
import { gameShortName } from "../games";
import { RemoteImage } from "../remote-image";
import { CoverBanner } from "../showcase-zoom";
import { openRoom } from "../open-room";
import { hoursLines } from "../store-hours";
import { colors, gutter, radius, spacing } from "../theme";
import { validateClaimFields, type ClaimErrors } from "../claim-validation";
import {
  AsyncButton,
  Body,
  Button,
  Card,
  CardImage,
  ErrorLine,
  Input,
  Muted,
  Title,
} from "../ui";
import { VerifiedMark } from "../verified-mark";

/** The header's banner: a strip the logo overlaps, the website's short cover. */
const COVER_HEIGHT = 144;
/** How far the header sits down the card, so the logo straddles the cover's edge. */
const HEADER_TOP = 88;
const LOGO = 64;

/**
 * A store, as a player sees it — claimed or not.
 *
 * The app's half of the website's /s/[storeId], and it exists because
 * the Nearby card listed shops the app had no way to open. The website
 * put a "View" button on every row from the start; the phone showed the
 * same rows as dead text, which is the parity gap that ships when a
 * feature is built on one platform and translated to the other.
 *
 * FACTUAL INFORMATION ONLY on an unclaimed listing — no logo, no photos,
 * no store-written description, none of which we have a licence to
 * reproduce. A mark, an address, and an honest label saying nobody at
 * the shop has claimed it yet.
 *
 * A CLAIMED store's page is the player profile's shape without the
 * cosmetics, the website's `StorePageHeader` drawn in React Native:
 * the banner as a strip, the logo overlapping its edge, the name with
 * the Verified mark, the Ultra line, the games, the hours with whether
 * it is open right now. No frames, no rings: a business page.
 *
 * Not a browser hand-off. The founder, on being thrown into Safari by a
 * tab that should have been native: a link out of the app is a link out
 * of the app.
 *
 * FOLLOWING is the same row the Room tab lists - joining a room signed
 * in has always written it - with a button here for the player who
 * found the shop before they walked in. A guest's button is the same
 * word, Follow, and it starts sign-up: one look for Follow, whoever is
 * being followed, the website's rule.
 */
export function StoreProfileScreen({ storeId }: { storeId: string }) {
  const navigation = useNavigation<NativeStackNavigationProp<StackParams>>();
  const [store, setStore] = useState<PublicStore | null>(null);
  /* "Next: Friday Locals · Fri, Sep 25, 6:30 PM", in the store's own zone. */
  const nextEvent =
    store?.board?.nextEventAt && store.board.nextEventName
      ? `${store.board.nextEventName} · ${new Intl.DateTimeFormat("en-US", {
          weekday: "short",
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
          timeZone: store.board.timeZone ?? undefined,
        }).format(new Date(store.board.nextEventAt))}`
      : null;
  /* The case as one shelf, so the zoom swipes along it. */
  const caseShelf = (store?.casePicks ?? []).map((pick) => ({
    imageUrl: pick.imageUrl,
    name: pick.cardName,
    cardNumber: pick.cardNumber,
  }));
  const [failed, setFailed] = useState(false);
  const [claiming, setClaiming] = useState(false);
  /* Null until the token has been looked for, so neither word is drawn
     on a guess. */
  const [signedIn, setSignedIn] = useState<boolean | null>(null);

  const load = useCallback(
    async (alive: () => boolean) => {
      try {
        const [fresh, token] = await Promise.all([
          getStore(storeId),
          storedAccessToken(),
        ]);
        if (alive()) {
          setStore(fresh.store);
          setSignedIn(Boolean(token));
          setFailed(false);
        }
      } catch {
        if (alive()) setFailed(true);
      }
    },
    [storeId],
  );

  useFocusEffect(
    useCallback(() => {
      let live = true;
      void load(() => live);
      return () => {
        live = false;
      };
    }, [load]),
  );

  if (failed) {
    return (
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: gutter,
          paddingVertical: spacing(4),
        }}
      >
        <Card>
          <Title>We could not open that store</Title>
          <Muted>It may not be listed any more. Try again in a moment.</Muted>
        </Card>
      </ScrollView>
    );
  }

  if (!store) {
    return (
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: gutter,
          paddingVertical: spacing(4),
        }}
      >
        <Card>
          <Muted>Loading…</Muted>
        </Card>
      </ScrollView>
    );
  }

  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{
        paddingHorizontal: gutter,
        paddingVertical: spacing(4),
        gap: spacing(4),
      }}
    >
      <Card style={{ paddingTop: spacing(6), overflow: "hidden" }}>
        {/* The banner carries down behind the logo and the name, then
            fades into the card: the player cover's short strip. */}
        <CoverBanner coverUrl={store.coverUrl ?? null} height={COVER_HEIGHT} fade />

        <View style={{ marginTop: HEADER_TOP, gap: spacing(1) }}>
          {/* The logo, a rounded square with the card's own colour as its
              border, straddling the banner's bottom edge. The
              placeholder stands in for a logo the store has not
              uploaded; an unclaimed listing never has one. */}
          <View
            style={{
              width: LOGO,
              height: LOGO,
              borderRadius: radius.card,
              borderWidth: 4,
              borderColor: colors.surface,
              backgroundColor: colors.elevated,
              overflow: "hidden",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {store.logoUrl ? (
              <RemoteImage
                uri={store.logoUrl}
                style={{ width: "100%", height: "100%" }}
              />
            ) : (
              <MaterialCommunityIcons
                name="storefront-outline"
                size={28}
                color={colors.textMuted}
              />
            )}
          </View>

          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              flexWrap: "wrap",
              gap: spacing(2),
              marginTop: spacing(2),
            }}
          >
            <Title>{store.name}</Title>
            {/* Two marks, never one inferred from the other: Verified is
                trust, Ultra is a product tier. */}
            {store.verified ? <VerifiedMark size={20} /> : null}
          </View>

          {store.ultra ? (
            <Text
              style={{
                color: colors.textSecondary,
                fontSize: 11,
                fontWeight: "600",
                letterSpacing: 1.5,
                textTransform: "uppercase",
              }}
            >
              cardflare <Text style={{ color: colors.accent }}>Ultra</Text> store
            </Text>
          ) : null}

          {store.city || store.region ? (
            <Body>{[store.city, store.region].filter(Boolean).join(", ")}</Body>
          ) : null}

          {store.verified ? (
            <Muted>
              cardflare Verified means cardflare has confirmed that this profile is
              controlled by the listed business. It is not an endorsement or guarantee
              of the business.
            </Muted>
          ) : store.unclaimed ? (
            <Muted>Unclaimed listing</Muted>
          ) : null}
        </View>

        {/* The same line the website draws: a room open right now
            opens it, otherwise the next night on the calendar. */}
        {store.board?.liveNow ? (
          <Text
            accessibilityRole="link"
            onPress={() => {
              const code = store.board?.joinCode;
              if (!code) return;
              void joinRoom(code).catch(() => {});
              openRoom(navigation);
            }}
            style={{ color: colors.accent, fontSize: 15, fontWeight: "600" }}
          >
            A room is open right now
          </Text>
        ) : nextEvent ? (
          <Body>Next: {nextEvent}</Body>
        ) : null}

        {store.description ? <Body>{store.description}</Body> : null}

        {store.games && store.games.length > 0 ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing(1.5) }}>
            {store.games.map((game) => (
              <Text
                key={game}
                style={{
                  color: colors.textSecondary,
                  backgroundColor: colors.elevated,
                  borderColor: colors.border,
                  borderWidth: 1,
                  borderRadius: 999,
                  paddingHorizontal: spacing(2.5),
                  paddingVertical: spacing(0.5),
                  fontSize: 12,
                  fontWeight: "600",
                  overflow: "hidden",
                }}
              >
                {gameShortName(game)}
              </Text>
            ))}
          </View>
        ) : null}

        {/* Follow, for a signed-in account; for a guest, the same button
            starts sign-up. Keyed on the server's answer so a follow made
            in a room shows here without a restart. */}
        {signedIn === null ? null : signedIn && store.following !== undefined ? (
          <FollowStoreButton
            key={`${store.storeId}:${store.following}`}
            storeId={store.storeId}
            initial={store.following}
          />
        ) : (
          <Button label="Follow" onPress={() => navigation.navigate("CreateAccount")} />
        )}
        <Muted>
          Following puts this store&rsquo;s nights in your Feed and on your Following
          list.
        </Muted>

        {store.hours ? (
          <View style={{ gap: spacing(0.5) }}>
            <Text
              style={{
                color: store.openNow ? colors.success : colors.textSecondary,
                fontWeight: "600",
                fontSize: 14,
              }}
            >
              {store.openNow ? "Open now" : "Closed now"}
            </Text>
            {hoursLines(store.hours).map((line) => (
              <View key={line.days} style={{ flexDirection: "row", gap: spacing(3) }}>
                <Text style={{ color: colors.textPrimary, fontSize: 14, minWidth: 92 }}>
                  {line.days}
                </Text>
                <Text style={{ color: colors.textSecondary, fontSize: 14 }}>
                  {line.hours}
                </Text>
              </View>
            ))}
          </View>
        ) : null}

        {store.casePicks && store.casePicks.length > 0 ? (
          <View style={{ gap: spacing(1.5) }}>
            <Text
              style={{ color: colors.textPrimary, fontWeight: "600", fontSize: 14 }}
            >
              In the case this week
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: spacing(2) }}
            >
              {store.casePicks.map((pick, index) => (
                <CardImage
                  key={pick.cardId}
                  imageUrl={pick.imageUrl}
                  width={64}
                  name={pick.cardName}
                  cardNumber={pick.cardNumber}
                  siblings={caseShelf}
                  position={index}
                />
              ))}
            </ScrollView>
          </View>
        ) : null}

        {store.address ? <Body>{store.address}</Body> : null}

        {store.phone ? (
          <Text
            style={{ color: colors.accent }}
            onPress={() => void Linking.openURL(`tel:${store.phone}`)}
          >
            {store.phone}
          </Text>
        ) : null}

        {store.website ? (
          <Text
            style={{ color: colors.accent }}
            onPress={() => void Linking.openURL(store.website!)}
          >
            {store.website}
          </Text>
        ) : null}
      </Card>

      {store.unclaimed ? (
        <Card>
          <Title>Own or manage this store?</Title>
          <Muted>
            Claiming lets you keep the details right and run rooms from your own counter
            code. cardflare confirms ownership before anything changes.
          </Muted>

          {claiming ? (
            <ClaimForm
              storeId={store.storeId}
              onCancel={() => setClaiming(false)}
              onSent={() => void load(() => true)}
            />
          ) : (
            <Button label="Claim this store" onPress={() => setClaiming(true)} />
          )}
        </Card>
      ) : null}

      {/* Attribution travels with the record. Overture Places is a mix
          of licences, so the line comes from the row, not a constant. */}
      {store.attribution ? <Muted>{`Listing data: ${store.attribution}`}</Muted> : null}
    </ScrollView>
  );
}

/**
 * The claim form, same five fields as the website's.
 *
 * Two required, all five answerable from memory at a counter. Anything
 * needing paperwork belongs in the email an admin sends, not in the
 * form that decides whether somebody bothers at all.
 */
function ClaimForm({
  storeId,
  onCancel,
  onSent,
}: {
  storeId: string;
  onCancel: () => void;
  onSent: () => void;
}) {
  const [fields, setFields] = useState<ClaimFields>({
    claimantName: "",
    claimantEmail: "",
    claimantRole: CLAIM_ROLES[0],
    businessEmail: "",
    notes: "",
  });
  const [error, setError] = useState<string | null>(null);
  /* Per field, drawn against the input it belongs to. One line at the
     bottom is how a junk STORE email once read as the founder's own,
     correct email being rejected. */
  const [fieldErrors, setFieldErrors] = useState<ClaimErrors>({});
  const [sent, setSent] = useState(false);

  const set = (key: keyof ClaimFields) => (value: string) => {
    setFields((current) => ({ ...current, [key]: value }));
    /* A field being retyped is a field being fixed. */
    setFieldErrors((current) =>
      current[key] ? { ...current, [key]: undefined } : current,
    );
  };

  const send = async () => {
    setError(null);

    const problems = validateClaimFields(fields);
    setFieldErrors(problems);
    if (Object.keys(problems).some((key) => problems[key as keyof ClaimErrors])) {
      return;
    }

    try {
      await claimStore(storeId, fields);
      setSent(true);
      onSent();
    } catch (problem) {
      setError(
        problem instanceof Error && problem.message
          ? problem.message
          : "Could not send that claim.",
      );
    }
  };

  if (sent) {
    return (
      <View style={{ gap: spacing(2) }}>
        <Body>We have your claim.</Body>
        <Muted>
          {`Someone will email ${fields.claimantEmail}. Nothing on the listing has changed yet.`}
        </Muted>
      </View>
    );
  }

  return (
    <View style={{ gap: spacing(2.5) }}>
      <Muted>
        A person at cardflare reads this and emails you back. Nothing changes until
        we&rsquo;ve confirmed you work there, and it stays free.
      </Muted>

      <Input
        value={fields.claimantName}
        onChangeText={set("claimantName")}
        placeholder="Your name"
        autoCapitalize="words"
        accessibilityLabel="Your name"
      />
      <ErrorLine message={fieldErrors.claimantName ?? null} />
      <Input
        value={fields.claimantEmail}
        onChangeText={set("claimantEmail")}
        placeholder="Your email"
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        accessibilityLabel="Your email"
      />
      <ErrorLine message={fieldErrors.claimantEmail ?? null} />

      {/* A row of taps rather than a picker: five options fit, and a
          native picker on a phone is a modal for no reason. */}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing(1.5) }}>
        {CLAIM_ROLES.map((role) => {
          const on = fields.claimantRole === role;

          return (
            <Text
              key={role}
              onPress={() => set("claimantRole")(role)}
              style={{
                color: on ? colors.accentContrast : colors.textSecondary,
                backgroundColor: on ? colors.accent : colors.elevated,
                borderColor: on ? colors.accent : colors.border,
                borderWidth: 1,
                borderRadius: 999,
                paddingHorizontal: spacing(2.5),
                paddingVertical: spacing(1.5),
                fontSize: 13,
                fontWeight: "600",
                overflow: "hidden",
              }}
            >
              {role}
            </Text>
          );
        })}
      </View>

      <Input
        value={fields.businessEmail}
        onChangeText={set("businessEmail")}
        placeholder="Store email (optional)"
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        accessibilityLabel="Store email, optional"
      />
      <ErrorLine message={fieldErrors.businessEmail ?? null} />
      <Muted>
        An address at the shop&rsquo;s own domain is the fastest way for us to confirm
        this. A personal one is fine too.
      </Muted>

      <ErrorLine message={fieldErrors.notes ?? null} />
      <Input
        value={fields.notes}
        onChangeText={set("notes")}
        placeholder="Anything else (optional)"
        multiline
        maxLength={500}
        accessibilityLabel="Anything else, optional"
      />

      <AsyncButton label="Send this claim" pendingLabel="Sending…" onPress={send} />
      <Button label="Cancel" variant="secondary" onPress={onCancel} />

      <ErrorLine message={error} />
    </View>
  );
}
