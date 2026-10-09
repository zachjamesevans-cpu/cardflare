import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import * as Location from "expo-location";
import { useEffect, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";

import type { StackParams } from "../App";
import {
  getStoreHere,
  lastRoom,
  rememberRoom,
  rememberRoomGame,
  type StoreHere,
} from "./api";
import { requestCoords, type Coords } from "./location";
import { openRoom } from "./open-room";
import {
  FIND_MY_STORE,
  JOIN_THE_ROOM,
  LOCATION_DENIED,
  NOT_NOW,
  NO_STORE_HERE,
  youreAtLine,
} from "./store-day-copy";
import { colors, radius, spacing } from "./theme";
import { Muted, Tap } from "./ui";

/**
 * You're here: the app opened inside a store, so it offers the store's
 * room. The founder (2026-10-09): "I miss the simplicity of just
 * getting into a room."
 *
 * THE RULES THIS FILE KEEPS:
 *
 *   - Never asks. The check on opening reads the position only when
 *     permission was granted before, somewhere a tap asked for it. The
 *     one place that asks is FindMyStore, a button that says what it
 *     is for.
 *   - Never joins by itself. The banner offers; JOIN_THE_ROOM is the
 *     only thing that walks in, and it walks in by the counter code,
 *     exactly as scanning the counter's QR does.
 *   - Foreground only, once per ten minutes, and the position goes into
 *     one request and out of memory (src/location.ts says why).
 *   - Not now is for the rest of the day at that store, kept across a
 *     relaunch so the banner does not come back on every unlock.
 */

/** How long a check stands before opening the app again checks again. */
const CHECK_EVERY_MS = 10 * 60 * 1000;

/** How long the opening check waits for a fresh fix. */
const FIX_TIMEOUT_MS = 8000;

/** storeId -> the phone's date it was waved off, "2026-10-09". */
const DISMISSED_KEY = "cf_store_here_dismissed";

let here: StoreHere | null = null;
let lastCheck = 0;
const listeners = new Set<(store: StoreHere | null) => void>();

function publish(store: StoreHere | null) {
  here = store;
  for (const listener of listeners) listener(store);
}

/** The phone's own date, for "the rest of the day". */
function phoneToday(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

async function readDismissed(): Promise<Record<string, string>> {
  try {
    const raw = await AsyncStorage.getItem(DISMISSED_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === "object"
      ? (parsed as Record<string, string>)
      : {};
  } catch {
    return {};
  }
}

async function dismissedToday(storeId: string): Promise<boolean> {
  return (await readDismissed())[storeId] === phoneToday();
}

async function dismissForToday(storeId: string): Promise<void> {
  const today = phoneToday();
  const kept = Object.fromEntries(
    Object.entries(await readDismissed()).filter(([, day]) => day === today),
  );
  kept[storeId] = today;
  try {
    await AsyncStorage.setItem(DISMISSED_KEY, JSON.stringify(kept));
  } catch {
    /* In memory it is already gone; a relaunch may offer it once more. */
  }
}

/**
 * The position, only if permission is already ours. Never shows a
 * dialog: no request call is made here, whatever the answer.
 */
async function positionIfGranted(): Promise<Coords | null> {
  try {
    const { granted } = await Location.getForegroundPermissionsAsync();
    if (!granted) return null;
    const last = await Location.getLastKnownPositionAsync({
      maxAge: 120_000,
      requiredAccuracy: 100,
    });
    const fix =
      last ??
      (await Promise.race([
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), FIX_TIMEOUT_MS)),
      ]));
    return fix
      ? { latitude: fix.coords.latitude, longitude: fix.coords.longitude }
      : null;
  } catch {
    return null;
  }
}

/**
 * What the banner should offer for this answer: nothing when the phone
 * is already in that store's room (the last room is its counter code),
 * nothing when it was waved off today.
 */
async function offerFor(store: StoreHere | null): Promise<StoreHere | null> {
  if (!store) return null;
  if ((await lastRoom().catch(() => null)) === store.code) return null;
  if (await dismissedToday(store.storeId)) return null;
  return store;
}

/**
 * The check as the app comes to the front: App.tsx calls it at launch
 * and on every return to the foreground. Throttled to once per ten
 * minutes; a silent no when permission was never given.
 */
export async function checkStoreHere(): Promise<void> {
  const now = Date.now();
  if (now - lastCheck < CHECK_EVERY_MS) return;
  lastCheck = now;

  const position = await positionIfGranted();
  if (!position) return;
  try {
    const { store } = await getStoreHere(position.latitude, position.longitude);
    publish(await offerFor(store));
  } catch {
    /* Throttled or offline: the next opening tries again. */
    lastCheck = 0;
  }
}

/** The store on offer, as it changes. */
export function useStoreHere(): StoreHere | null {
  const [store, setStore] = useState<StoreHere | null>(here);
  useEffect(() => {
    listeners.add(setStore);
    setStore(here);
    return () => {
      listeners.delete(setStore);
    };
  }, []);
  return store;
}

/**
 * The slim banner at the top of the Feed and of Rooms: "You're at Mox",
 * Join the room, Not now. Nothing at all when no store is on offer.
 */
export function YoureHereBanner() {
  const navigation = useNavigation<NativeStackNavigationProp<StackParams>>();
  const store = useStoreHere();
  const [busy, setBusy] = useState(false);

  if (!store) return null;

  /* The scanner's door: remember the counter code, clear any game
     scope (the counter code is universal), then the Room joins it. */
  const joinTheRoom = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await rememberRoom(store.code);
      await rememberRoomGame(null);
      publish(null);
      openRoom(navigation);
    } catch {
      /* The keychain refused; the banner stays for another tap. */
    } finally {
      setBusy(false);
    }
  };

  const notNow = () => {
    publish(null);
    void dismissForToday(store.storeId);
  };

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: spacing(2),
        borderRadius: radius.card,
        borderWidth: 1,
        borderColor: colors.accent,
        backgroundColor: colors.surface,
        paddingVertical: spacing(2),
        paddingLeft: spacing(3),
        paddingRight: spacing(2),
      }}
    >
      <Ionicons name="storefront" size={18} color={colors.accent} />
      <Text
        numberOfLines={1}
        style={{ flex: 1, color: colors.textPrimary, fontSize: 14, fontWeight: "700" }}
      >
        {youreAtLine(store.storeName)}
      </Text>
      <Tap
        onPress={notNow}
        hitSlop={6}
        accessibilityLabel={NOT_NOW}
        style={{ paddingHorizontal: spacing(1.5), paddingVertical: spacing(1.5) }}
      >
        <Text style={{ color: colors.textSecondary, fontSize: 13, fontWeight: "600" }}>
          {NOT_NOW}
        </Text>
      </Tap>
      <Tap
        onPress={() => void joinTheRoom()}
        disabled={busy}
        accessibilityLabel={JOIN_THE_ROOM}
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: spacing(1),
          borderRadius: 999,
          backgroundColor: colors.accent,
          paddingHorizontal: spacing(3),
          paddingVertical: spacing(1.5),
          opacity: busy ? 0.7 : 1,
        }}
      >
        {busy ? <ActivityIndicator size="small" color={colors.accentContrast} /> : null}
        <Text style={{ color: colors.accentContrast, fontSize: 13, fontWeight: "700" }}>
          {JOIN_THE_ROOM}
        </Text>
      </Tap>
    </View>
  );
}

/**
 * For a phone that never gave its position: one small button on Rooms
 * that asks, from a tap, and then looks. Found puts the banner up
 * (and undoes a Not now, because this tap asked); none and refused
 * each say so, with the counter's QR as the way in either way.
 */
export function FindMyStore() {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const find = async () => {
    if (busy) return;
    setBusy(true);
    setNote(null);
    try {
      const outcome = await requestCoords();
      if (outcome.status !== "granted") {
        setNote(LOCATION_DENIED);
        return;
      }
      /* The ask's fix may be a coarse one from a while ago; a store is
         a hundred and fifty metres across, so a closer one if it comes. */
      const position = (await positionIfGranted()) ?? outcome.coords;
      const { store } = await getStoreHere(position.latitude, position.longitude);
      lastCheck = Date.now();
      if (!store) {
        setNote(NO_STORE_HERE);
        return;
      }
      if ((await lastRoom().catch(() => null)) !== store.code) publish(store);
    } catch {
      setNote(NO_STORE_HERE);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ gap: spacing(1.5), alignItems: "flex-start" }}>
      <Tap
        onPress={() => void find()}
        disabled={busy}
        accessibilityLabel={FIND_MY_STORE}
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: spacing(1.5),
          borderRadius: 999,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.elevated,
          paddingHorizontal: spacing(3),
          paddingVertical: spacing(1.5),
          opacity: busy ? 0.7 : 1,
        }}
      >
        {busy ? (
          <ActivityIndicator size="small" color={colors.textPrimary} />
        ) : (
          <Ionicons name="location-outline" size={14} color={colors.textPrimary} />
        )}
        <Text style={{ color: colors.textPrimary, fontSize: 13, fontWeight: "600" }}>
          {FIND_MY_STORE}
        </Text>
      </Tap>
      {note ? <Muted>{note}</Muted> : null}
    </View>
  );
}
