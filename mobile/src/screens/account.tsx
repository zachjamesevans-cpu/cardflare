import { useNavigation, useFocusEffect } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useCallback, useState } from "react";
import { ScrollView } from "react-native";

import type { StackParams } from "../../App";
import { API_BASE } from "../config";
import { getMe, signOut, storedAccessToken, type Me } from "../api";
import { Body, Button, Card, Muted, Title } from "../ui";
import { spacing } from "../theme";

/**
 * The Account tab: who you are, what you're hunting, what came along.
 * Mirrors the website's account page — wants lead, housekeeping follows.
 * Guests see the honest pitch, not a wall: the whole room loop works
 * without any of this.
 */
/** GET and POST the no-auth ping; the verdict names where POSTs die. */
function ConnectionTest() {
  const [result, setResult] = useState<string | null>(null);

  const probe = async (method: "GET" | "POST") => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12_000);
    const started = Date.now();
    try {
      const response = await fetch(`${API_BASE}/api/v1/ping`, {
        method,
        signal: controller.signal,
        ...(method === "POST"
          ? { headers: { "content-type": "application/json" }, body: "{}" }
          : {}),
      });
      return `${method} ${response.status} in ${Date.now() - started}ms`;
    } catch {
      return `${method} failed after ${Date.now() - started}ms`;
    } finally {
      clearTimeout(timer);
    }
  };

  return (
    <Card>
      <Title>Connection test</Title>
      {result && <Body>{result}</Body>}
      <Button
        label="Run test"
        variant="secondary"
        onPress={() => {
          setResult("Testing…");
          void (async () => {
            const get = await probe("GET");
            const post = await probe("POST");
            setResult(`${get}\n${post}`);
          })();
        }}
      />
    </Card>
  );
}

export function AccountScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<StackParams>>();
  const [me, setMe] = useState<Me | null>(null);
  const [checked, setChecked] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let live = true;

      void (async () => {
        const token = await storedAccessToken();
        if (!token) {
          if (live) {
            setMe(null);
            setChecked(true);
          }
          return;
        }
        try {
          const result = await getMe();
          if (live) setMe(result);
        } catch {
          if (live) setMe(null);
        } finally {
          if (live) setChecked(true);
        }
      })();

      return () => {
        live = false;
      };
    }, []),
  );

  if (!checked) {
    return (
      <ScrollView contentContainerStyle={{ padding: spacing(4) }}>
        <Muted>Loading…</Muted>
      </ScrollView>
    );
  }

  if (!me) {
    return (
      <ScrollView contentContainerStyle={{ padding: spacing(4), gap: spacing(4) }}>
        <Card>
          <Title>Have an account?</Title>
          <Body>
            Sign in and the cards you post follow you between stores, your Collectr
            collection flags Flares you can answer, and your phone hears about
            offers the moment they land.
          </Body>
          <Button label="Sign in" onPress={() => navigation.navigate("SignIn")} />
        </Card>
        <Card>
          <Body>
            No account? Nothing changes — scan any counter code and trade as a
            guest, same as always. Accounts are invite-only while CardFlare is in
            its pilot.
          </Body>
        </Card>
        <ConnectionTest />
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={{ padding: spacing(4), gap: spacing(4) }}>
      <Card>
        <Muted>Signed in as</Muted>
        <Title>{me.player.displayName}</Title>
        {me.collection && (
          <Muted>
            {`Collection: ${me.collection.cardsMatched.toLocaleString()} cards along — matched quietly in every room, never listed.`}
          </Muted>
        )}
      </Card>

      <Card>
        <Title>Your saved wants</Title>
        <Body>
          Saved automatically when you post a Flare, cleared when a trade finds the
          card. Walk into any room and it offers to post these again.
        </Body>
        {me.wants.length === 0 ? (
          <Muted>Nothing yet. Post a Flare and it will be waiting here.</Muted>
        ) : (
          me.wants.map((want) => (
            <Card key={want.id}>
              <Body>
                {want.cardName}
                {want.quantity > 1 ? ` ×${want.quantity}` : ""}
              </Body>
              <Muted>
                {`${want.cardNumber} · ${want.printingLabel ?? "Any printing"}`}
              </Muted>
            </Card>
          ))
        )}
      </Card>

      <Button
        label="Sign out"
        variant="secondary"
        onPress={() => {
          void signOut().then(() => setMe(null));
        }}
      />
      <ConnectionTest />
    </ScrollView>
  );
}
