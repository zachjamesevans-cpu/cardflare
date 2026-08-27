import { useEffect, useState } from "react";
import { Text, View } from "react-native";

import { readRoomTimer, type RoomTimerWire } from "./room-timer-wire";
import { Card } from "./ui";
import { colors, spacing } from "./theme";

/**
 * The wall's tournament clocks, in a pocket — the app's twin of the
 * website's RoomTimers. The wire carries instants, so this ticks on
 * the phone's own clock: right between refreshes, and it rolls into
 * extra time (red) by itself the moment the television does.
 */
export function RoomTimersCard({ timers }: { timers: RoomTimerWire[] | undefined }) {
  const count = timers?.length ?? 0;
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (count === 0) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [count]);

  if (!timers || timers.length === 0) return null;

  return (
    <Card>
      {timers.map((wire) => {
        const reading = readRoomTimer(wire, now);

        return (
          <View
            key={wire.id}
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              gap: spacing(3),
            }}
          >
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text
                numberOfLines={1}
                style={{ color: colors.textPrimary, fontSize: 15, fontWeight: "700" }}
              >
                {wire.gameName}
                {wire.round !== null ? (
                  <Text style={{ color: colors.textMuted, fontWeight: "400" }}>
                    {` · Round ${wire.round}`}
                  </Text>
                ) : null}
              </Text>
              <Text
                numberOfLines={1}
                style={{
                  color: reading.atTime ? colors.danger : colors.textMuted,
                  fontSize: 12,
                  fontWeight: reading.atTime ? "700" : "400",
                }}
              >
                {reading.atTime
                  ? `${reading.label} · ${wire.headline}`
                  : reading.label}
              </Text>
            </View>

            <Text
              style={{
                color: reading.atTime ? colors.danger : colors.textPrimary,
                fontSize: 22,
                fontWeight: "800",
                fontVariant: ["tabular-nums"],
              }}
            >
              {reading.clock}
            </Text>
          </View>
        );
      })}
    </Card>
  );
}
