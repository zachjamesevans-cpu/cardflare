import { useCallback, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { ScrollView } from "react-native";

import { API_BASE } from "../config";
import { getMe, type Me } from "../api";
import { Body, Button, Card, Muted, Title } from "../ui";
import { spacing } from "../theme";

/**
 * Settings: what the Account tab used to be, now behind the profile's cog.
 *
 * Nothing here changed but where it lives — the founder's instruction was
 * exactly that. Your saved wants, your collection, and the connection
 * test that has earned its keep more than once.
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
      <Button
        label="Run test"
        variant="secondary"
        onPress={() => {
          setResult("Testing…");
          void (async () => {
            const lines: string[] = [];
            for (const [label, method, body, type] of MATRIX) {
              lines.push(await probe(label, method, body, type));
              setResult(lines.join("\n"));
            }
          })();
        }}
      />
    </Card>
  );
}

export function SettingsScreen() {
  const [me, setMe] = useState<Me | null>(null);

  useFocusEffect(
    useCallback(() => {
      let live = true;
      void (async () => {
        try {
          const result = await getMe();
          if (live) setMe(result);
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
      {me?.collection && (
        <Card>
          <Title>Your collection</Title>
          <Muted>
            {`${me.collection.cardsMatched.toLocaleString()} cards along, matched quietly in every room and never listed.`}
          </Muted>
        </Card>
      )}

      <Card>
        <Title>Your saved wants</Title>
        <Body>
          Saved automatically when you post a Flare, cleared when a trade finds the
          card. Walk into any room and it offers to post these again.
        </Body>
        {!me || me.wants.length === 0 ? (
          <Muted>Nothing yet. Post a Flare and it will be waiting here.</Muted>
        ) : (
          me.wants.map((want) => (
            <Card key={want.id}>
              <Body>
                {want.cardName}
                {want.quantity > 1 ? ` ×${want.quantity}` : ""}
              </Body>
              <Muted>
                {`${want.cardNumber} · ${want.printingLabel ?? "Any printing"}${
                  want.deckLabel ? ` · ${want.deckLabel}` : ""
                }`}
              </Muted>
            </Card>
          ))
        )}
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
