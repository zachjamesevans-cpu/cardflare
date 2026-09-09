import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Text, View } from "react-native";

import type { StackParams } from "../App";
import { Body, Button, Card, Tap, Title } from "./ui";
import { colors, spacing } from "./theme";

/**
 * The small pitch a guest sees for a free account: the website's
 * `AccountPitch`, word for word.
 *
 * The founder: "we need a call to action in the join room / room
 * screen that asks to create their cardflare account." Create opens
 * the same sign-up the welcome screen runs, as a stack screen that
 * comes back here when it is done; Sign in is the existing screen.
 * Either way the room refreshes on return and the guest's seat becomes
 * the account's.
 */
export function AccountPitch({ variant }: { variant: "join" | "room" }) {
  const navigation = useNavigation<NativeStackNavigationProp<StackParams>>();

  return (
    <Card>
      <Text
        style={{
          color: colors.accent,
          fontSize: 11,
          fontWeight: "700",
          letterSpacing: 1.6,
          textTransform: "uppercase",
        }}
      >
        {variant === "room" ? "You're in as a guest" : "Free account"}
      </Text>
      <Title>
        {variant === "room" ? "Keep your cards with you." : "Or join with a free account."}
      </Title>
      <Body>
        Your Flares, binder and Embers follow you to every store and show. As a guest,
        they stay in this room.
      </Body>
      <View style={{ gap: spacing(2) }}>
        <Button
          label="Create free account"
          onPress={() => navigation.navigate("CreateAccount")}
        />
        <Tap onPress={() => navigation.navigate("SignIn")} hitSlop={6}>
          <Text
            style={{
              color: colors.textSecondary,
              textAlign: "center",
              fontSize: 14,
              fontWeight: "600",
              paddingVertical: spacing(1),
            }}
          >
            Sign in
          </Text>
        </Tap>
      </View>
    </Card>
  );
}
