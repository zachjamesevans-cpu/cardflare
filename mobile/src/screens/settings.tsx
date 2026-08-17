import { useCallback, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { ScrollView } from "react-native";

import { API_BASE } from "../config";
import {
  describeError,
  getMe,
  getProfile,
  renameProfile,
  setHandle,
  type Me,
  type Profile,
} from "../api";
import { HandleField, NameField } from "./profile";
import { AsyncButton, Body, Card, Muted, Title } from "../ui";
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
  const [me, setMe] = useState<Me | null>(null);
  /*
   * Your name lives here rather than on the front of the profile.
   * The founder: "no need to have the name editor front and center on
   * a profile. that should be buried somewhere in the profile
   * settings." Renaming is a once-a-year act; the profile is a place
   * to look at, not a form.
   */
  const [profile, setProfile] = useState<Profile | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [renamed, setRenamed] = useState<string | null>(null);

  const [rehandling, setRehandling] = useState(false);
  const [rehandled, setRehandled] = useState<string | null>(null);

  async function rename(displayName: string) {
    setRenaming(true);
    setRenamed(null);
    try {
      await renameProfile(displayName);
      setProfile((was) => (was ? { ...was, displayName } : was));
      setRenamed("Name updated.");
    } catch (caught) {
      setRenamed(`Could not save that name. ${describeError(caught)}`);
    } finally {
      setRenaming(false);
    }
  }

  async function rehandle(handle: string) {
    setRehandling(true);
    setRehandled(null);
    try {
      await setHandle(handle);
      setProfile((was) => (was ? { ...was, handle } : was));
      setRehandled(`You are now @${handle}.`);
    } catch (caught) {
      setRehandled(describeError(caught));
    } finally {
      setRehandling(false);
    }
  }

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

  return (
    <ScrollView contentContainerStyle={{ padding: spacing(4), gap: spacing(4) }}>
      {profile && (
        <Card>
          <Title>Your name</Title>
          <Body>
            What people see when you walk into a room. Spaces and capitals are fine,
            and it does not have to be unique.
          </Body>
          <NameField current={profile.displayName} busy={renaming} onSave={rename} />
          {renamed && <Muted>{renamed}</Muted>}

          {/* The other half of the same question, in the same card, the
              same way the website groups them. */}
          <Title>How people find you</Title>
          <Body>
            Your handle is yours alone. Letters, numbers and underscores, so it can
            be said out loud and typed without guessing.
          </Body>
          <HandleField
            current={profile.handle}
            busy={rehandling}
            onSave={rehandle}
          />
          {rehandled && <Muted>{rehandled}</Muted>}
        </Card>
      )}

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
