import { Ionicons } from "@expo/vector-icons";
import * as SecureStore from "expo-secure-store";
import { useEffect, useState } from "react";
import {
  Image,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  checkHandle,
  friendlyError,
  type HandleAvailability,
  setGames,
  signUp,
} from "../api";
import { HeaderButton } from "../header";
import { API_BASE } from "../config";
import { EMAIL_MISMATCH, emailsMatch } from "../email-confirm";
import { formatHandle, HANDLE_MAX, HANDLE_MIN, handleWhileTyping } from "../handle";
import { TCG_GAMES, type GameSlug } from "../games";
import { registerForPush } from "../push";
import { LAUNCH_BACKGROUND, LAUNCH_WORDMARK_WIDTH } from "../launch-view";
import { Intro } from "../intro";
import { WHERE_BODY, WHERE_SKIP, WHERE_TITLE, introGame } from "../intro-copy";
import { NearbyLocationAsk } from "../nearby-location-ask";
import { SignInScreen } from "./sign-in";
import {
  AsyncButton,
  Body,
  Button,
  Card,
  ErrorLine,
  HandleInput,
  Input,
  Muted,
  Tap,
  Title,
} from "../ui";
import { BRAND, colors, radius, spacing } from "../theme";

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
 * The splash does not move. The launch path loads no Skia and no
 * Reanimated on purpose - three dead TestFlight builds taught that
 * lesson - and now it runs no animation of its own either.
 */

const SEEN_KEY = "cf-welcome-seen";

/* The founder's wordmark art, ratio read off the file itself so a
   future master with different proportions stays correctly shaped. */
const WORDMARK = require("../../assets/wordmark.png");
const WORDMARK_SOURCE = Image.resolveAssetSource(WORDMARK);
/* The full wordmark in the soft green, the logo while BRAND is "soft":
   the art the launch screen and the Feed's header draw. */
const WORDMARK_SOFT = require("../../assets/wordmark-soft.png");
const WORDMARK_SOFT_SOURCE = Image.resolveAssetSource(WORDMARK_SOFT);

export async function hasSeenWelcome(): Promise<boolean> {
  try {
    return (await SecureStore.getItemAsync(SEEN_KEY)) === "1";
  } catch {
    return true; // If storage is broken, do not wall the app off.
  }
}

/**
 * Forget that the front door was ever shown.
 *
 * Signing out returns somebody to it, and a relaunch afterwards should
 * land there too — otherwise quitting and reopening drops a signed-out
 * person back into the tabs with no visible way in. "Just browsing"
 * clears the same way: a guest who signs out can browse again from the
 * same screen they started at.
 */
export async function forgetWelcome(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(SEEN_KEY);
  } catch {
    /* Seen-ness is a nicety; the app must not care if it cannot stick. */
  }
}

async function markWelcomeSeen(): Promise<void> {
  try {
    await SecureStore.setItemAsync(SEEN_KEY, "1");
  } catch {
    // Seen-ness is a nicety; the app must not care if it cannot stick.
  }
}

type Step = "splash" | "account" | "games" | "where" | "intro" | "signin";

/**
 * How a welcome ended: "post" from the intro's last button (open the
 * composer), "look" from its quieter one or Skip (the Feed, with the +
 * pointed at), "scan" from the splash's guest door (the scanner, no
 * account), or nothing - signed in, where no intro is shown.
 */
export type WelcomeEnd = "post" | "look" | "scan" | undefined;

export function WelcomeScreen({
  onDone,
  initialStep = "splash",
  onCancel,
  preview = false,
}: {
  onDone: (end: WelcomeEnd) => void;
  /**
   * "account" opens straight on the sign-up form: a guest who tapped
   * Create account inside a room has already chosen, and the
   * splash would only be a second door to walk through.
   */
  initialStep?: "splash" | "account";
  /** Back out of the account step when this was opened from a room. */
  onCancel?: () => void;
  /**
   * Demo mode's sign-up preview: the whole flow, nothing created. The
   * founder: "i want to make sure I can see the sign up process." Every
   * step's answer moves on without a call that writes, and the welcome
   * is not marked seen.
   */
  preview?: boolean;
}) {
  const [step, setStep] = useState<Step>(initialStep);
  /* The games picked a step before the intro, for its scenes' art. */
  const [played, setPlayed] = useState<string[]>([]);
  /* The handle just chosen, for the intro's shared binder link. */
  const [handle, setHandle] = useState<string | null>(null);

  const done = (end?: WelcomeEnd) => {
    if (!preview) void markWelcomeSeen();
    onDone(end);
  };

  return (
    /* The launch screen's green-grey under every step, so the first run
       is one surface from the launch screen to the intro. */
    <View style={{ flex: 1, backgroundColor: LAUNCH_BACKGROUND }}>
      {step === "splash" && (
        <Splash
          onCreate={() => setStep("account")}
          onSignIn={() => setStep("signin")}
          onScan={() => done("scan")}
        />
      )}
      {step === "account" && (
        <StepShell
          title="Create your account"
          onBack={
            initialStep === "account" && onCancel ? onCancel : () => setStep("splash")
          }
        >
          <AccountStep
            preview={preview}
            onDone={(chosen) => {
              setHandle(chosen);
              setStep("games");
            }}
          />
        </StepShell>
      )}
      {step === "games" && (
        <StepShell title="Which games do you play?">
          <GamesStep
            preview={preview}
            onDone={(picked) => {
              setPlayed(picked);
              setStep("where");
            }}
          />
        </StepShell>
      )}
      {step === "where" && (
        <StepShell title={WHERE_TITLE}>
          <WhereStep preview={preview} onDone={() => setStep("intro")} />
        </StepShell>
      )}
      {step === "intro" && (
        <Intro
          game={introGame(played)}
          handle={handle}
          onPost={() => done("post")}
          onLook={() => done("look")}
        />
      )}
      {step === "signin" && (
        <ScrollView contentContainerStyle={{ paddingTop: spacing(14) }}>
          <SignInScreen
            onSignedIn={() => done()}
            onCreateAccount={() => setStep("account")}
          />
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

/**
 * The pitch, cut to what it has to say. The founder: "this splash screen
 * is a bit too much imo. lots of random text", then "build it go" on the
 * plan: the wordmark and one line, Create account, a small way to sign
 * in, and the guest door said as what it is for.
 *
 * Gone, and where each now lives: "Meet nearby" (the intro's second
 * card), the games line (the games step, a screen later), and "Built
 * for collectors, not marketplaces". "I already have an account" is a
 * link under the one button rather than a second button.
 *
 * "At a store? Scan the code" replaced "Browse without an account". The
 * guest door is for a player at a store joining a room without signing
 * up - PRODUCT.md's front door - and "browse" read like a skip that led
 * to a Feed a guest can do little with. It ends the welcome straight on
 * the scanner (welcome end "scan").
 *
 * On the launch screen's green-grey, the founder's "trademark dark
 * green/gray", so the hand-over from the launch screen does not change.
 * The mark does not move: the launch path loads no Skia and no
 * Reanimated, and the founder cut both the glow and the pulse.
 */
function Splash({
  onCreate,
  onSignIn,
  onScan,
}: {
  onCreate: () => void;
  onSignIn: () => void;
  onScan: () => void;
}) {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: LAUNCH_BACKGROUND,
        paddingHorizontal: spacing(6),
        paddingTop: insets.top,
        paddingBottom: insets.bottom + spacing(6),
      }}
    >
      {/* The name and one line, a little above the middle. */}
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          gap: spacing(4),
        }}
      >
        {BRAND === "soft" ? (
          /* The full wordmark at the launch screen's width
             (launch-view.tsx): the founder, "make the cf logo the
             cardflare logo full". */
          <Image
            source={WORDMARK_SOFT}
            style={{
              width: LAUNCH_WORDMARK_WIDTH,
              height:
                LAUNCH_WORDMARK_WIDTH *
                (WORDMARK_SOFT_SOURCE.height / WORDMARK_SOFT_SOURCE.width),
              resizeMode: "contain",
            }}
            accessibilityLabel="cardflare"
          />
        ) : (
          <>
            <Image
              source={require("../../assets/cardflare-mark.png")}
              style={{ height: 140, width: 140, resizeMode: "contain" }}
            />
            {/* The name is the founder's wordmark art, never a font. */}
            <Image
              source={WORDMARK}
              style={{
                height: 44,
                width: 44 * (WORDMARK_SOURCE.width / WORDMARK_SOURCE.height),
                resizeMode: "contain",
              }}
              accessibilityLabel="cardflare"
            />
          </>
        )}
        <Text
          style={{
            color: colors.textPrimary,
            fontSize: 17,
            fontWeight: "500",
            textAlign: "center",
          }}
        >
          Find your cards. Trade in person.
        </Text>
      </View>

      {/* The actions, low, where a thumb already is. */}
      <View style={{ gap: spacing(3) }}>
        <Button label="Create account" onPress={onCreate} />
        <Text style={{ color: colors.textSecondary, fontSize: 15, textAlign: "center" }}>
          Have an account?{" "}
          <Text
            style={{ color: colors.accent, fontWeight: "700" }}
            accessibilityRole="button"
            onPress={onSignIn}
            suppressHighlighting
          >
            Sign in
          </Text>
        </Text>
        <Tap
          onPress={onScan}
          hitSlop={8}
          accessibilityLabel="At a store? Scan the code"
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: spacing(1.5),
            paddingVertical: spacing(2),
          }}
        >
          <Ionicons name="qr-code-outline" size={16} color={colors.textMuted} />
          <Text style={{ color: colors.textMuted, fontSize: 14, fontWeight: "600" }}>
            At a store? Scan the code
          </Text>
        </Tap>
      </View>
    </View>
  );
}

/* No "Step N of 2" line: the website's welcome dropped its step
   counter, and the title says where you are. */
function StepShell({
  title,
  onBack,
  children,
}: {
  title: string;
  /**
   * The way back out, when there is one. Step 1 has it: tapping "Create
   * my account" on the splash used to be a one-way door, and somebody
   * who already has an account and tapped the wrong button was left
   * with a sign-up form and no sign-in anywhere on it. Step 2 has none
   * on purpose — the account exists by then, and back would be a lie.
   */
  onBack?: () => void;
  children: React.ReactNode;
}) {
  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "android" ? "height" : undefined}
    >
      <ScrollView
        contentContainerStyle={{
          padding: spacing(4),
          paddingTop: spacing(14),
          gap: spacing(3),
        }}
        keyboardShouldPersistTaps="handled"
        /*
         * iOS insets the scroll for the keyboard itself, and scrolls the
         * focused field into view with it. The padding behaviour this
         * used to lean on only SHRANK the view, which left "Create my
         * account" — the one button on the app's first screen — sitting
         * under the keys with nothing saying it was there.
         */
        automaticallyAdjustKeyboardInsets
      >
        {onBack ? (
          /* The same chevron every pushed screen's header draws, its
             glyph pulled out to the text margin. */
          <View style={{ alignSelf: "flex-start", marginLeft: -10 }}>
            <HeaderButton
              icon="chevron-back"
              label="Back"
              color={colors.accent}
              onPress={onBack}
            />
          </View>
        ) : null}
        <Text style={{ color: colors.textPrimary, fontSize: 26, fontWeight: "800" }}>
          {title}
        </Text>
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/**
 * Everything an account is, asked once — the website's shape, word for
 * word.
 *
 * It used to be two screens with the name behind the second. The founder
 * walked his own sign-up on the website and named the seam: "this should
 * all be on one page." The app had the same split and the same fix.
 *
 * The handle used to write itself from the name. The founder ended
 * that: "if someone puts in their name, eventually every single
 * username of someone's first name will be taken" — so the field starts
 * empty, and while it is typed the server is asked live whether the
 * name is still free, same as the website.
 */
type HandleStatus = "idle" | "checking" | HandleAvailability;

function useHandleAvailability(handle: string): HandleStatus {
  const tooShort = handle.length < HANDLE_MIN;

  /* The last answer, held WITH the handle that produced it, so "still
     checking" is derived rather than tracked — the website's exact
     shape, and the reason a stale answer can never be pinned under a
     fresher handle than the one it was asked about. */
  const [settled, setSettled] = useState<{
    handle: string;
    verdict: HandleAvailability;
  } | null>(null);

  useEffect(() => {
    if (tooShort) return;

    let current = true;
    const timer = setTimeout(() => {
      void checkHandle(handle).then((verdict) => {
        if (current) setSettled({ handle, verdict });
      });
    }, 400);

    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [handle, tooShort]);

  return tooShort ? "idle" : settled?.handle === handle ? settled.verdict : "checking";
}

function HandleAvailabilityLine({
  status,
  handle,
}: {
  status: HandleStatus;
  handle: string;
}) {
  if (status === "checking") {
    return <Muted>Checking…</Muted>;
  }
  if (status === "available") {
    return (
      <Text style={{ color: colors.success, fontSize: 14 }}>
        {formatHandle(handle)} is available.
      </Text>
    );
  }
  if (status === "taken") {
    return (
      <Text style={{ color: colors.danger, fontSize: 14 }}>
        That handle is taken. Try another one.
      </Text>
    );
  }
  return null;
}

function AccountStep({
  onDone,
  preview,
}: {
  onDone: (handle: string) => void;
  preview: boolean;
}) {
  const [email, setEmail] = useState("");
  /* The address twice, as on the website: a typo here is an account
     whose password reset goes to somebody else, or nowhere. */
  const [confirmEmail, setConfirmEmail] = useState("");
  const emailsAgree = emailsMatch(email, confirmEmail);
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [handle, setHandle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const availability = useHandleAvailability(handle);

  return (
    <Card>
      <Body>
        Your email and a password, then who you are to other players. After this,
        which games you play and roughly where.
      </Body>
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
        value={confirmEmail}
        onChangeText={setConfirmEmail}
        placeholder="Confirm email"
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        autoComplete="off"
        accessibilityLabel="Confirm email"
      />
      {confirmEmail.trim() !== "" && !emailsAgree ? (
        <Text style={{ color: colors.danger, fontSize: 14 }}>{EMAIL_MISMATCH}</Text>
      ) : null}
      <Input
        value={password}
        onChangeText={setPassword}
        placeholder="Password (at least 8 characters)"
        secureTextEntry
        autoComplete="new-password"
      />
      <Input
        value={name}
        onChangeText={setName}
        placeholder="Your name"
        autoCorrect={false}
        maxLength={40}
      />
      <HandleInput
        value={handle}
        onChangeText={(next) => setHandle(handleWhileTyping(next))}
        placeholder="your_handle"
        maxLength={HANDLE_MAX}
      />
      <HandleAvailabilityLine status={availability} handle={handle} />
      <Muted>
        Your name is what people see next to your posts. Your handle is how they look
        you up, and it is yours alone.
      </Muted>
      {/* Agreement said where the account is made, both documents a tap
          away: App Review wants the terms, and their zero tolerance for
          abuse, accepted at sign-up. The website's form says the same. */}
      <Text style={{ color: colors.textMuted, fontSize: 13, lineHeight: 19 }}>
        By creating an account you agree to the{" "}
        <Text
          style={{ color: colors.accent, fontWeight: "600" }}
          accessibilityRole="link"
          onPress={() => void Linking.openURL(`${API_BASE}/terms`)}
        >
          Terms of use
        </Text>{" "}
        and{" "}
        <Text
          style={{ color: colors.accent, fontWeight: "600" }}
          accessibilityRole="link"
          onPress={() => void Linking.openURL(`${API_BASE}/privacy`)}
        >
          Privacy policy
        </Text>
        , including zero tolerance for abusive content.
      </Text>
      <ErrorLine message={error} />
      <AsyncButton
        label="Create account"
        pendingLabel="Creating…"
        disabled={!emailsAgree}
        onPress={async () => {
          setError(null);
          if (!emailsAgree) {
            setError(EMAIL_MISMATCH);
            return;
          }
          if (password.length < 8) {
            setError("The password needs at least 8 characters.");
            return;
          }
          if (name.trim().length < 2) {
            setError("Please put in a name people will recognise.");
            return;
          }
          if (handle.trim().length < HANDLE_MIN) {
            setError(`A handle needs at least ${HANDLE_MIN} characters.`);
            return;
          }
          if (preview) {
            onDone(handle.trim());
            return;
          }

          const result = await signUp(email, password, name.trim(), handle.trim());
          if (!result.ok) {
            setError(result.message);
            return;
          }
          onDone(handle.trim());
        }}
      />
    </Card>
  );
}

function GamesStep({
  onDone,
  preview,
}: {
  onDone: (picked: GameSlug[]) => void;
  preview: boolean;
}) {
  const [picked, setPicked] = useState<Set<GameSlug>>(new Set());
  const [error, setError] = useState<string | null>(null);
  /* A save has failed once: the way past it appears. */
  const [saveFailed, setSaveFailed] = useState(false);

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
        When the stores you follow run event nights on cardflare, this is how we know
        which ones are yours. Pick any number.
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
                backgroundColor: on ? colors.accentTint : colors.elevated,
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
          if (preview) {
            onDone([...picked]);
            return;
          }
          /*
           * A failed save is a note, never a wall. The account already
           * exists by this step, there is no Back, and nothing else
           * depends on the games being saved: this button used to stay put
           * on a network blip, and with nothing else on the screen the
           * new account was trapped on its last question. A failure
           * says so, the button stays to try again, and "Continue
           * without saving" goes in regardless.
           */
          try {
            await setGames([...picked]);
          } catch (caught) {
            setError(
              `Your games did not save. ${friendlyError(caught)} Try again, or carry on without them.`,
            );
            setSaveFailed(true);
            return;
          }
          // Push becomes worth asking for the moment an account exists.
          await registerForPush();
          onDone([...picked]);
        }}
      />
      {saveFailed ? (
        <Tap
          onPress={() => {
            void registerForPush();
            onDone([...picked]);
          }}
          hitSlop={8}
        >
          <Text
            style={{
              color: colors.accent,
              fontWeight: "600",
              textAlign: "center",
              paddingVertical: spacing(2),
            }}
          >
            Continue without saving
          </Text>
        </Tap>
      ) : null}
    </Card>
  );
}

/**
 * Roughly where they play, optional: the ZIP Nearby measures from. The
 * intro's next card promises "players near you", so the question comes
 * first. Skip is always there; Settings asks again later.
 */
function WhereStep({ onDone, preview }: { onDone: () => void; preview: boolean }) {
  return (
    <Card>
      <Body>{WHERE_BODY}</Body>
      <NearbyLocationAsk
        intro={null}
        saveLabel="Save"
        keepAsZip
        dryRun={preview}
        onDone={onDone}
      />
      <Tap onPress={onDone} hitSlop={8}>
        <Text
          style={{
            color: colors.accent,
            fontWeight: "600",
            textAlign: "center",
            paddingVertical: spacing(2),
          }}
        >
          {WHERE_SKIP}
        </Text>
      </Tap>
    </Card>
  );
}
