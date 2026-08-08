import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useState } from "react";
import { ScrollView, View } from "react-native";

import type { StackParams } from "../../App";
import { rememberRoom } from "../api";
import { Body, Button, Card, Input, Title } from "../ui";
import { spacing } from "../theme";

/**
 * The Join tab — the front door, guest-first like the website: scan the
 * counter code or type it. Everything account-shaped lives in its own
 * tab; this screen is for getting into a room in two taps.
 */
export function HomeScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<StackParams>>();
  const [code, setCode] = useState("");

  const enter = async (raw: string) => {
    await rememberRoom(raw.trim().toUpperCase());
    setCode("");
    navigation.navigate("Tabs", { screen: "Room" });
  };

  return (
    <ScrollView contentContainerStyle={{ padding: spacing(4), gap: spacing(4) }}>
      <Card>
        <Title>Join a room</Title>
        <Body>
          Scan the code on the store&rsquo;s counter — or type it if scanning is
          awkward. No account needed.
        </Body>

        <Button label="Scan a QR code" onPress={() => navigation.navigate("Scan")} />

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
            onPress={() => code.trim() && void enter(code)}
          />
        </View>
      </Card>

      <Card>
        <Title>How it works</Title>
        <Body>
          Post a Flare for the card you&rsquo;re hunting. When somebody in the room
          has it, they raise a hand — and you go trade, in person, at the table.
        </Body>
      </Card>
    </ScrollView>
  );
}
