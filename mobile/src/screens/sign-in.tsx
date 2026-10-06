import { useState } from "react";
import { Linking, Text, View } from "react-native";

import { friendlyError, signIn } from "../api";
import { API_BASE, authConfigured } from "../config";
import { startProSync } from "../pro";
import { registerForPush } from "../push";
import { Body, Button, Card, ErrorLine, Input, Title } from "../ui";
import { colors, gutter, spacing } from "../theme";

/**
 * Password sign-in against the same accounts as the website. Optional by
 * design: the whole room loop works as a guest, and this screen says so
 * rather than pretending an account is required.
 */
export function SignInScreen({
  onSignedIn,
  onCreateAccount,
}: {
  onSignedIn: () => void;
  /**
   * "New here? Create an account". Somebody who tapped Sign in without
   * an account had no way across to sign-up from this screen; every
   * caller has a sign-up to send them to, and says where.
   */
  onCreateAccount?: () => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);

    try {
      const result = await signIn(email, password);

      if (!result.ok) {
        setError(result.message);
        return;
      }

      // The moment push becomes worth asking for: a signed-in account
      // can actually receive something.
      await registerForPush();
      /* A Pro bought on this Apple ID before signing in is finished now,
         not the next time somebody opens the Pro screen. */
      void startProSync().catch(() => {});
      onSignedIn();
    } catch (caught) {
      /* The keychain, usually: a throw here used to leave the button
         stuck on "Signing in…" with nothing said. */
      setError(`Could not sign in. ${friendlyError(caught)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View
      style={{
        paddingHorizontal: gutter,
        paddingVertical: spacing(4),
        gap: spacing(4),
      }}
    >
      <Card>
        <Title>Sign in</Title>
        <Body>
          The same account you use on cardflare.gg. No account? You can still scan into
          any room as a guest; accounts are for keeping your Flares and collection
          with you.
        </Body>

        <ErrorLine
          message={
            authConfigured() ? error : "Sign-in is not configured in this build."
          }
        />

        <Input
          value={email}
          onChangeText={setEmail}
          placeholder="Email"
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
        />
        <Input
          value={password}
          onChangeText={setPassword}
          placeholder="Password"
          secureTextEntry
          autoComplete="current-password"
        />

        <Button label={busy ? "Signing in…" : "Sign in"} onPress={submit} busy={busy} />

        {/* The website's reset flow, because that is where email lands.
            Named as the website so the jump to Safari is no surprise. */}
        <Text
          onPress={() => void Linking.openURL(`${API_BASE}/login/reset`)}
          accessibilityRole="link"
          style={{
            color: colors.textMuted,
            fontSize: 13,
            textDecorationLine: "underline",
          }}
        >
          Reset password on cardflare.gg
        </Text>
      </Card>

      {onCreateAccount ? (
        <Text style={{ color: colors.textSecondary, textAlign: "center" }}>
          New here?{" "}
          <Text
            onPress={onCreateAccount}
            accessibilityRole="link"
            style={{ color: colors.accent, fontWeight: "700" }}
          >
            Create an account
          </Text>
        </Text>
      ) : null}
    </View>
  );
}
