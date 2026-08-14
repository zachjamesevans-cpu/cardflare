import { useState } from "react";
import { Linking, Text, View } from "react-native";

import { signIn } from "../api";
import { API_BASE, authConfigured } from "../config";
import { registerForPush } from "../push";
import { Body, Button, Card, ErrorLine, Input, Title } from "../ui";
import { colors, spacing } from "../theme";

/**
 * Password sign-in against the same accounts as the website. Optional by
 * design: the whole room loop works as a guest, and this screen says so
 * rather than pretending an account is required.
 */
export function SignInScreen({ onSignedIn }: { onSignedIn: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);

    const result = await signIn(email, password);
    setBusy(false);

    if (!result.ok) {
      setError(result.message);
      return;
    }

    // The moment push becomes worth asking for: a signed-in account
    // can actually receive something.
    await registerForPush();
    onSignedIn();
  };

  return (
    <View style={{ padding: spacing(4), gap: spacing(4) }}>
      <Card>
        <Title>Sign in</Title>
        <Body>
          The same account you use on cardflare.gg. No account? You can still scan
          into any room as a guest; accounts are for keeping your wants and
          collection with you.
        </Body>

        <ErrorLine message={authConfigured() ? error : "Sign-in is not configured in this build."} />

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

        {/* The website's reset flow, because that is where email lands. */}
        <Text
          onPress={() => void Linking.openURL(`${API_BASE}/login/reset`)}
          style={{
            color: colors.textMuted,
            fontSize: 13,
            textDecorationLine: "underline",
          }}
        >
          Forgot your password?
        </Text>
      </Card>
    </View>
  );
}
