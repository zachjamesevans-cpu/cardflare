import * as SecureStore from "expo-secure-store";
import { useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";

import { chooseUsername, describeError, setGames, signUp } from "../api";
import { TCG_GAMES, type GameSlug } from "../games";
import { registerForPush } from "../push";
import { SignInScreen } from "./sign-in";
import { AsyncButton, Body, Button, Card, ErrorLine, Input, Muted, Tap, Title } from "../ui";
import { colors, radius, spacing } from "../theme";

/**
 * The first thing a fresh install shows: the pitch, then the whole
 * sign-up, one question per screen - account, username, games. The
 * founder's call: the TestFlight link IS the invitation, so no invite
 * code exists anywhere in this flow.
 *
 * "Just browsing" stays, quietly: guests scanning into a room without
 * an account is the product's front door (PRODUCT.md), and a welcome
 * screen must not wall it off. It marks the welcome as seen and gets
 * out of the way.
 *
 * The splash's motion is plain Animated - the launch path loads no
 * Skia and no Reanimated on purpose; three dead TestFlight builds
 * taught that lesson.
 */

const SEEN_KEY = "cf-welcome-seen";

export async function hasSeenWelcome(): Promise<boolean> {
  try {
    return (await SecureStore.getItemAsync(SEEN_KEY)) === "1";
  } catch {
    return true; // If storage is broken, do not wall the app off.
  }
}

async function markWelcomeSeen(): Promise<void> {
  try {
    await SecureStore.setItemAsync(SEEN_KEY, "1");
  } catch {
    // Seen-ness is a nicety; the app must not care if it cannot stick.
  }
}

type Step = "splash" | "account" | "username" | "games" | "signin";

export function WelcomeScreen({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState<Step>("splash");

  const done = () => {
    void markWelcomeSeen();
    onDone();
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.canvas }}>
      {step === "splash" && (
        <Splash
          onCreate={() => setStep("account")}
          onSignIn={() => setStep("signin")}
          onSkip={done}
        />
      )}
      {step === "account" && (
        <StepShell step={1} title="Create your account">
          <AccountStep onDone={() => setStep("username")} />
        </StepShell>
      )}
      {step === "username" && (
        <StepShell step={2} title="Pick your name">
          <UsernameStep onDone={() => setStep("games")} />
        </StepShell>
      )}
      {step === "games" && (
        <StepShell step={3} title="Which games do you play?">
          <GamesStep onDone={done} />
        </StepShell>
      )}
      {step === "signin" && (
        <ScrollView contentContainerStyle={{ paddingTop: spacing(10) }}>
          <SignInScreen onSignedIn={done} />
          <Tap onPress={() => setStep("splash")}>
            <Text
              style={{
                color: colors.textMuted,
                textAlign: "center",
                padding: spacing(4),
              }}
            >
              Back
            </Text>
          </Tap>
        </ScrollView>
      )}
    </View>
  );
}

/** The pitch: the mark breathing inside a slow lime glow. */
function Splash({
  onCreate,
  onSignIn,
  onSkip,
}: {
  onCreate: () => void;
  onSignIn: () => void;
  onSkip: () => void;
}) {
  const glow = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(glow, {
          toValue: 1,
          duration: 2600,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(glow, {
          toValue: 0,
          duration: 2600,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [glow]);

  return (
    <View
      style={{
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        padding: spacing(6),
        gap: spacing(3),
      }}
    >
      {/* The glow is a scaled, faded disc behind the mark - all
          transform and opacity, so it rides the native driver. */}
      <View style={{ alignItems: "center", justifyContent: "center" }}>
        <Animated.View
          style={{
            position: "absolute",
            width: 260,
            height: 260,
            borderRadius: 130,
            backgroundColor: colors.accent,
            opacity: glow.interpolate({ inputRange: [0, 1], outputRange: [0.05, 0.16] }),
            transform: [
              { scale: glow.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1.05] }) },
            ],
          }}
        />
        <Animated.View
          style={{
            transform: [
              { scale: glow.interpolate({ inputRange: [0, 1], outputRange: [1, 1.04] }) },
            ],
          }}
        >
          <Image
            source={require("../../assets/cardflare-mark.png")}
            style={{ height: 140, width: 140, resizeMode: "contain" }}
          />
        </Animated.View>
      </View>

      <Text
        style={{
          color: colors.textPrimary,
          fontSize: 34,
          fontWeight: "800",
          letterSpacing: 0.5,
        }}
      >
        CardFlare
      </Text>
      <Text
        style={{
          color: colors.textSecondary,
          fontSize: 17,
          textAlign: "center",
          lineHeight: 24,
        }}
      >
        The room can see what you are hunting.{"\n"}Post your wants. Trade face to
        face.
      </Text>

      <View style={{ alignSelf: "stretch", gap: spacing(2), marginTop: spacing(4) }}>
        <Button label="Create my account" onPress={onCreate} />
        <Button label="I already have one" variant="secondary" onPress={onSignIn} />
        <Tap onPress={onSkip} hitSlop={8}>
          <Text
            style={{
              color: colors.textMuted,
              textAlign: "center",
              paddingVertical: spacing(2),
            }}
          >
            Just browsing for now
          </Text>
        </Tap>
      </View>
    </View>
  );
}

function StepShell({
  step,
  title,
  children,
}: {
  step: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={{
          padding: spacing(4),
          paddingTop: spacing(14),
          gap: spacing(3),
        }}
        keyboardShouldPersistTaps="handled"
      >
        <Muted>Step {step} of 3</Muted>
        <Text style={{ color: colors.textPrimary, fontSize: 26, fontWeight: "800" }}>
          {title}
        </Text>
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function AccountStep({ onDone }: { onDone: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  return (
    <Card>
      <Body>An email address and a password. Everything else comes after.</Body>
      <Input
        value={email}
        onChangeText={setEmail}
        placeholder="Email address"
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        autoComplete="email"
      />
      <Input
        value={password}
        onChangeText={setPassword}
        placeholder="Password (at least 8 characters)"
        secureTextEntry
        autoComplete="new-password"
      />
      <ErrorLine message={error} />
      <AsyncButton
        label="Create my account"
        pendingLabel="Creating…"
        onPress={async () => {
          setError(null);
          if (password.length < 8) {
            setError("The password needs at least 8 characters.");
            return;
          }
          const result = await signUp(email, password);
          if (!result.ok) {
            setError(result.message);
            return;
          }
          onDone();
        }}
      />
    </Card>
  );
}

function UsernameStep({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  return (
    <Card>
      <Body>
        The name people see when you walk into a room. You can change it later.
      </Body>
      <Input
        value={name}
        onChangeText={setName}
        placeholder="Your player name"
        autoCapitalize="none"
        autoCorrect={false}
        maxLength={40}
      />
      <ErrorLine message={error} />
      <AsyncButton
        label="That is me"
        pendingLabel="Saving…"
        onPress={async () => {
          setError(null);
          try {
            await chooseUsername(name.trim());
            onDone();
          } catch (caught) {
            setError(describeError(caught));
          }
        }}
      />
    </Card>
  );
}

function GamesStep({ onDone }: { onDone: () => void }) {
  const [picked, setPicked] = useState<Set<GameSlug>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const toggle = (slug: GameSlug) => {
    setPicked((current) => {
      const next = new Set(current);
      if (next.has(slug)) {
        next.delete(slug);
      } else {
        next.add(slug);
      }
      return next;
    });
  };

  return (
    <Card>
      <Body>
        When locals near you go up on CardFlare, this is how we know which ones are
        yours. Pick any number.
      </Body>

      <View style={{ gap: spacing(2) }}>
        {TCG_GAMES.map((game) => {
          const on = picked.has(game.slug);
          return (
            <Pressable
              key={game.slug}
              onPress={() => toggle(game.slug)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on }}
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                borderRadius: radius.control,
                borderWidth: 1,
                borderColor: on ? colors.accent : colors.border,
                backgroundColor: on ? "rgba(198, 238, 79, 0.1)" : colors.elevated,
                paddingHorizontal: spacing(4),
                paddingVertical: spacing(3),
              }}
            >
              <Text
                style={{
                  color: on ? colors.textPrimary : colors.textSecondary,
                  fontWeight: "700",
                }}
              >
                {game.label}
              </Text>
              <View
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: on ? colors.accent : colors.borderStrong,
                  backgroundColor: on ? colors.accent : "transparent",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {on && (
                  <Text style={{ color: colors.accentContrast, fontSize: 12 }}>✓</Text>
                )}
              </View>
            </Pressable>
          );
        })}
      </View>

      <ErrorLine message={error} />
      <AsyncButton
        label={
          picked.size === 0
            ? "None of these yet"
            : `Save my ${picked.size === 1 ? "game" : `${picked.size} games`}`
        }
        pendingLabel="Saving…"
        onPress={async () => {
          setError(null);
          try {
            await setGames([...picked]);
          } catch (caught) {
            setError(describeError(caught));
            return;
          }
          // Push becomes worth asking for the moment an account exists.
          await registerForPush();
          onDone();
        }}
      />
    </Card>
  );
}
