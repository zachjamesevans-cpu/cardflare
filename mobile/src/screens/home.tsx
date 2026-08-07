import { useCallback, useEffect, useState } from "react";
import { ScrollView, View } from "react-native";

import { getMe, signOut, storedAccessToken, type Me } from "../api";
import { Body, Button, Card, Input, Muted, Title } from "../ui";
import { spacing } from "../theme";

/**
 * The front door: scan or type a code (the guest loop, first and
 * biggest, exactly like the website), with the account's things below
 * for people who have one.
 */
export function HomeScreen({
  onScan,
  onEnterCode,
  onSignIn,
  onInbox,
  onSignedOut,
}: {
  onScan: () => void;
  onEnterCode: (code: string) => void;
  onSignIn: () => void;
  onInbox: () => void;
  onSignedOut: () => void;
}) {
  const [code, setCode] = useState("");
  const [me, setMe] = useState<Me | null>(null);
  const [signedIn, setSignedIn] = useState(false);

  const refresh = useCallback(async () => {
    const token = await storedAccessToken();
    setSignedIn(Boolean(token));

    if (!token) {
      setMe(null);
      return;
    }

    try {
      setMe(await getMe());
    } catch {
      // A dead token renders the guest view; sign-in fixes it.
      setMe(null);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <ScrollView contentContainerStyle={{ padding: spacing(4), gap: spacing(4) }}>
      <Card>
        <Title>Join a room</Title>
        <Body>
          Scan the code on the counter — or type it if scanning is awkward.
        </Body>

        <Button label="Scan a QR code" onPress={onScan} />

        <View style={{ flexDirection: "row", gap: spacing(2) }}>
          <View style={{ flex: 1 }}>
            <Input
              value={code}
              onChangeText={setCode}
              placeholder="Or enter the code"
              autoCapitalize="characters"
              autoCorrect={false}
            />
          </View>
          <Button
            label="Go"
            variant="secondary"
            onPress={() => code.trim() && onEnterCode(code.trim())}
          />
        </View>
      </Card>

      {me ? (
        <>
          <Card>
            <Title>{`You're in as ${me.player.displayName}`}</Title>
            <Body>
              {me.wants.length === 0
                ? "Nothing saved yet. Post a Flare in a room and it will follow you here."
                : `Hunting ${me.wants.length} ${me.wants.length === 1 ? "card" : "cards"} — walk into a room and it will offer to post them.`}
            </Body>
            {me.collection && (
              <Muted>
                {`Collection: ${me.collection.cardsMatched.toLocaleString()} cards along, matched quietly in every room.`}
              </Muted>
            )}
          </Card>

          <Button label="Notifications" variant="secondary" onPress={onInbox} />
          <Button
            label="Sign out"
            variant="secondary"
            onPress={() => {
              void signOut().then(() => {
                void refresh();
                onSignedOut();
              });
            }}
          />
        </>
      ) : (
        <Card>
          <Title>Have an account?</Title>
          <Body>
            {signedIn
              ? "Your sign-in expired. Sign in again and your wants come back."
              : "Sign in and the cards you post follow you between stores — and your phone hears about offers the moment they land."}
          </Body>
          <Button label="Sign in" variant="secondary" onPress={onSignIn} />
        </Card>
      )}
    </ScrollView>
  );
}
