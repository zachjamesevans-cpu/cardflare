import { useCallback, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { Linking, ScrollView, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import {
  claimStore,
  getStore,
  CLAIM_ROLES,
  type ClaimFields,
  type PublicStore,
} from "../api";
import { colors, spacing } from "../theme";
import { validateClaimFields, type ClaimErrors } from "../claim-validation";
import { AsyncButton, Body, Button, Card, ErrorLine, Input, Muted, Title } from "../ui";

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
 * Not a browser hand-off. The founder, on being thrown into Safari by a
 * tab that should have been native: a link out of the app is a link out
 * of the app.
 */
export function StoreProfileScreen({ storeId }: { storeId: string }) {
  const [store, setStore] = useState<PublicStore | null>(null);
  const [failed, setFailed] = useState(false);
  const [claiming, setClaiming] = useState(false);

  const load = useCallback(
    async (alive: () => boolean) => {
      try {
        const fresh = await getStore(storeId);
        if (alive()) {
          setStore(fresh.store);
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
      <ScrollView contentContainerStyle={{ padding: spacing(4) }}>
        <Card>
          <Title>We could not open that store</Title>
          <Muted>It may not be listed any more. Try again in a moment.</Muted>
        </Card>
      </ScrollView>
    );
  }

  if (!store) {
    return (
      <ScrollView contentContainerStyle={{ padding: spacing(4) }}>
        <Card>
          <Muted>Loading…</Muted>
        </Card>
      </ScrollView>
    );
  }

  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ padding: spacing(4), gap: spacing(4) }}
    >
      <Card>
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing(2) }}>
          <MaterialCommunityIcons
            name="storefront-outline"
            size={22}
            color={colors.textMuted}
          />
          <Title>{store.name}</Title>
          {/* Two marks, never one inferred from the other: Verified is
              trust, Ultra is a product tier. */}
          {store.verified ? (
            <MaterialCommunityIcons
              name="check-decagram"
              size={16}
              color={colors.accent}
            />
          ) : null}
        </View>

        {store.unclaimed ? <Muted>Unclaimed listing</Muted> : null}
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
            cardflare listed this shop from public map data so players could find it. If
            you work there, tell us and we&rsquo;ll hand the listing over.
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
