import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { useKeepAwake } from "expo-keep-awake";
import { useCallback, useEffect, useState } from "react";
import { Alert, RefreshControl, ScrollView, Text, View } from "react-native";

import { describeError, getMe, type Me } from "../api";
import { controlTimer, getHub, type HubView } from "../remote-api";
import type { RemoteOp, RemoteTimer } from "../remote-wire";
import { readRoomTimer } from "../room-timer-wire";
import { colors, gutter, radius, spacing } from "../theme";
import { Card, ErrorLine, Loading, Muted, Tap, Title } from "../ui";

/**
 * The timer remote: the store's round clocks, run from a pocket.
 *
 * The founder: "having someone being able to control the round timers
 * on the phone app? like a 'remote' in a way. so they can just pull
 * out their phone and not have to run back to the store computer."
 *
 * Three rules keep it honest:
 *
 * - THE PHONE IS NEVER THE CLOCK. It polls the hub every five seconds
 *   for the same instants the television reads and ticks the digits
 *   from its own clock in between, exactly as the room's timer card
 *   does. A phone asleep in a pocket changes nothing on the wall.
 * - A PRESS IS ONE OP. The button disables itself, the server answers
 *   with the timer as it now is, and that answer replaces the timer on
 *   screen. No guessing at what a press did.
 * - SILENCE IS SAID OUT LOUD. When the last good poll is older than
 *   thirty seconds a banner says so, and says the wall keeps counting,
 *   because the person holding this is about to walk to the counter
 *   and should know whether they need to.
 */

const POLL_MS = 5_000;
const STALE_MS = 30_000;

type Staff = NonNullable<Me["staff"]>[number];

/** "12s ago", "3m ago", "2h ago" - for the "Paused by Zach" line. */
function ago(iso: string, now: number): string {
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return "";
  const seconds = Math.max(0, Math.round((now - at) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.round(minutes / 60)}h ago`;
}

/** What the last press did, in the past tense the line needs. */
const CONTROL_VERB: Record<RemoteTimer["status"], string> = {
  ready: "Reset",
  running: "Started",
  paused: "Paused",
  time_called: "Time called",
  overtime: "Extra time started",
  complete: "Completed",
};

/** "50:00" for a clock that has not started: the regulation length. */
function staticClock(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function RemoteScreen({ storeId }: { storeId?: string }) {
  /* A remote face-down on the judge table must not lock. */
  useKeepAwake();

  const [staff, setStaff] = useState<Staff[] | null>(null);
  const [picked, setPicked] = useState<string | null>(storeId ?? null);
  const [hub, setHub] = useState<HubView | null>(null);
  /* The phone's clock at the last poll that answered; null before one has. */
  const [heardAt, setHeardAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  /* The op in flight on each timer, so only that button goes quiet. */
  const [busy, setBusy] = useState<Record<string, RemoteOp>>({});
  const [now, setNow] = useState(() => Date.now());

  /* Who this account may run, for the picker and the header. */
  useEffect(() => {
    let live = true;
    void getMe()
      .then((me) => {
        if (!live) return;
        const list = me.staff ?? [];
        setStaff(list);
        if (!storeId && list.length === 1) setPicked(list[0].storeId);
      })
      .catch((caught) => {
        if (live) {
          setStaff([]);
          setError(describeError(caught));
        }
      });
    return () => {
      live = false;
    };
  }, [storeId]);

  const poll = useCallback(async () => {
    if (!picked) return;
    try {
      const fresh = await getHub(picked);
      setHub(fresh);
      setHeardAt(Date.now());
      setError(null);
    } catch (caught) {
      setError(describeError(caught));
    }
  }, [picked]);

  /* Every five seconds while this screen is the one being looked at. */
  useFocusEffect(
    useCallback(() => {
      if (!picked) return;
      void poll();
      const id = setInterval(() => void poll(), POLL_MS);
      return () => clearInterval(id);
    }, [picked, poll]),
  );

  /* The digits, from this phone's clock. */
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const press = useCallback(async (timer: RemoteTimer, op: RemoteOp) => {
    setBusy((current) => ({ ...current, [timer.id]: op }));
    try {
      const { timer: fresh } = await controlTimer(timer.id, op);
      setHub((current) =>
        current
          ? {
              ...current,
              displays: current.displays.map((display) => ({
                ...display,
                timers: display.timers.map((t) => (t.id === fresh.id ? fresh : t)),
              })),
            }
          : current,
      );
      setError(null);
    } catch (caught) {
      setError(describeError(caught));
    } finally {
      setBusy((current) => {
        const next = { ...current };
        delete next[timer.id];
        return next;
      });
    }
  }, []);

  const store = staff?.find((s) => s.storeId === picked) ?? null;

  /* No store chosen yet: the picker, or the reason there is none. */
  if (!picked) {
    return (
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.canvas }}
        contentContainerStyle={{
          paddingHorizontal: gutter,
          paddingVertical: spacing(4),
          gap: spacing(3),
        }}
      >
        <ErrorLine message={error} />
        {staff === null ? (
          <Loading />
        ) : staff.length === 0 ? (
          <Card>
            <Title>No store to run</Title>
            <Muted>
              The remote is for owners and organizers. A store owner can name you one
              from their Event Hub.
            </Muted>
          </Card>
        ) : (
          <>
            <Muted>Which counter?</Muted>
            {staff.map((s) => (
              <Tap key={s.storeId} onPress={() => setPicked(s.storeId)}>
                <Card
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Title>{s.name}</Title>
                    <Muted>{`Counter code ${s.code}`}</Muted>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
                </Card>
              </Tap>
            ))}
          </>
        )}
      </ScrollView>
    );
  }

  const stale = heardAt === null ? error !== null : now - heardAt > STALE_MS;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.canvas }}
      contentContainerStyle={{
        paddingHorizontal: gutter,
        paddingVertical: spacing(4),
        gap: spacing(3),
      }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          tintColor={colors.accent}
          onRefresh={() => {
            setRefreshing(true);
            void poll().finally(() => setRefreshing(false));
          }}
        />
      }
    >
      {stale && (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: spacing(2),
            backgroundColor: colors.elevated,
            borderColor: colors.warning,
            borderWidth: 1,
            borderRadius: radius.control,
            padding: spacing(3),
          }}
        >
          <Ionicons name="cloud-offline-outline" size={18} color={colors.warning} />
          <Text style={{ color: colors.textPrimary, flex: 1, fontSize: 14 }}>
            Not hearing from the server. The wall keeps counting on its own.
          </Text>
        </View>
      )}
      <ErrorLine message={error} />

      {store && <Muted>{store.name}</Muted>}

      {hub === null ? (
        <Loading />
      ) : hub.displays.length === 0 ? (
        <Card>
          <Title>Nothing on the wall</Title>
          <Muted>This store has no displays set up yet.</Muted>
        </Card>
      ) : (
        hub.displays.map((display) => (
          <View key={display.id} style={{ gap: spacing(2) }}>
            <Text
              style={{
                color: colors.textSecondary,
                fontSize: 13,
                fontWeight: "700",
                textTransform: "uppercase",
                letterSpacing: 0.6,
                paddingHorizontal: spacing(1),
              }}
            >
              {display.name}
            </Text>
            {display.timers.length === 0 ? (
              <Card>
                <Muted>No timer on this display right now.</Muted>
              </Card>
            ) : (
              display.timers.map((timer) => (
                <TimerCard
                  key={timer.id}
                  timer={timer}
                  now={now}
                  busy={busy[timer.id] ?? null}
                  onPress={(op) => void press(timer, op)}
                />
              ))
            )}
          </View>
        ))
      )}
    </ScrollView>
  );
}

/** One clock and the buttons that apply to it right now. */
function TimerCard({
  timer,
  now,
  busy,
  onPress,
}: {
  timer: RemoteTimer;
  now: number;
  busy: RemoteOp | null;
  onPress: (op: RemoteOp) => void;
}) {
  const { status, auto } = timer;

  /* The wall's reading when there is one; a still clock otherwise. */
  const reading = timer.wire
    ? readRoomTimer(timer.wire, now)
    : status === "ready"
      ? { clock: staticClock(timer.regulationMs), label: "Ready", atTime: false }
      : status === "complete"
        ? { clock: staticClock(0), label: "Complete", atTime: false }
        : { clock: staticClock(0), label: "Paused", atTime: false };

  const regulationMinutes = Math.round(timer.regulationMs / 60_000);

  const confirmReset = () =>
    Alert.alert(
      `Reset to ${regulationMinutes} minutes?`,
      "The wall goes back to the top.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Reset", style: "destructive", onPress: () => onPress("reset") },
      ],
    );

  const confirmComplete = () =>
    Alert.alert("Complete this round?", "The clock stops and the wall shows it done.", [
      { text: "Cancel", style: "cancel" },
      { text: "Complete", style: "destructive", onPress: () => onPress("complete") },
    ]);

  const running = status === "running";
  const paused = status === "paused";
  const timeCalled = status === "time_called";
  const overtime = status === "overtime";
  const complete = status === "complete";
  const autoLive = auto.counting || auto.held;

  const button = (
    label: string,
    op: RemoteOp,
    tone: "primary" | "secondary" | "quiet" = "secondary",
    confirm?: () => void,
  ) => (
    <RemoteButton
      key={op}
      label={label}
      tone={tone}
      busy={busy === op}
      disabled={busy !== null && busy !== op}
      onPress={() => (confirm ? confirm() : onPress(op))}
    />
  );

  /* Order is fixed; presence depends on the state. Each press sends
     exactly one op from remote-wire.ts. */
  const buttons = [
    (status === "ready" || paused) && button("Start", "start", "primary"),
    running && button("Pause", "pause", "primary"),
    running && button("Call time", "call-time", "primary"),
    (running || paused) && button("+1 min", "add-minute"),
    (running || paused) && button("−1 min", "subtract-minute"),
    timeCalled &&
      !timer.turnCounted &&
      button("Start overtime", "start-overtime", "primary"),
    overtime && timer.turnCounted && button("Next turn", "next-turn", "primary"),
    overtime && timer.turnCounted && button("Previous turn", "previous-turn"),
    (timeCalled || complete) &&
      !auto.counting &&
      button("Next round", "next-round", "primary"),
    auto.counting && button("Hold", "auto-hold"),
    auto.held && button("Resume", "auto-resume", "primary"),
    autoLive && button("+2 min", "auto-extend"),
    autoLive && button("Start now", "auto-start-now", "primary"),
    status !== "ready" && button("Reset", "reset", "quiet", confirmReset),
    (running || paused || timeCalled || overtime) &&
      button("Complete", "complete", "quiet", confirmComplete),
  ].filter(Boolean);

  return (
    <Card>
      <View style={{ gap: spacing(0.5) }}>
        <Text
          numberOfLines={1}
          style={{ color: colors.textPrimary, fontSize: 15, fontWeight: "700" }}
        >
          {timer.eventName}
          <Text style={{ color: colors.textMuted, fontWeight: "400" }}>
            {` · Round ${timer.round}`}
          </Text>
        </Text>
        <Muted>{timer.gameName}</Muted>
      </View>

      <View style={{ alignItems: "center", paddingVertical: spacing(2) }}>
        <Text
          style={{
            color: reading.atTime ? colors.danger : colors.textPrimary,
            fontSize: 56,
            fontWeight: "800",
            fontVariant: ["tabular-nums"],
            lineHeight: 64,
          }}
        >
          {reading.clock}
        </Text>
        <Text
          style={{
            color: reading.atTime ? colors.danger : colors.textMuted,
            fontSize: 14,
            fontWeight: reading.atTime ? "700" : "400",
          }}
        >
          {reading.label}
        </Text>
      </View>

      {timer.controlledBy && timer.controlledAt ? (
        <Muted>
          {`${CONTROL_VERB[status]} by ${timer.controlledBy}, ${ago(timer.controlledAt, now)}`}
        </Muted>
      ) : null}

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing(2) }}>
        {buttons}
      </View>
    </Card>
  );
}

/**
 * A remote's button: big enough to hit while walking, two to a row.
 * Primary is the verb the moment calls for; secondary adjusts; quiet
 * is for Reset and Complete, which ask before they act.
 */
function RemoteButton({
  label,
  tone,
  busy,
  disabled,
  onPress,
}: {
  label: string;
  tone: "primary" | "secondary" | "quiet";
  busy: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const fill =
    tone === "primary"
      ? colors.accent
      : tone === "secondary"
        ? colors.elevated
        : colors.surface;
  const ink =
    tone === "primary"
      ? colors.accentContrast
      : tone === "secondary"
        ? colors.textPrimary
        : colors.danger;

  return (
    <Tap
      onPress={onPress}
      disabled={busy || disabled}
      accessibilityLabel={label}
      style={{
        flexGrow: 1,
        flexBasis: "45%",
        minHeight: 48,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: fill,
        borderColor: tone === "primary" ? colors.accent : colors.border,
        borderWidth: 1,
        borderRadius: radius.control,
        paddingHorizontal: spacing(3),
        opacity: busy ? 0.6 : disabled ? 0.8 : 1,
      }}
    >
      <Text style={{ color: ink, fontSize: 16, fontWeight: "700" }}>
        {busy ? "…" : label}
      </Text>
    </Tap>
  );
}
