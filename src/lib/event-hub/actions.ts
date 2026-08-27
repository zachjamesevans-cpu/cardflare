"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getViewer } from "@/lib/auth/session";
import { text } from "@/lib/form-value";
import { GAME_PROFILES, procedureFor } from "./game-profiles";
import type { Bracket, GameId } from "./game-profiles";
import {
  addTimer,
  createDisplay,
  editTimer,
  findDisplay,
  findTimer,
  listTimers,
  patchTimer,
  removeTimer,
  reorderTimers,
  updateDisplay,
  type HubDisplay,
} from "./repository";
import {
  checkAnnouncement,
  checkDisplayName,
  checkLayout,
  checkNightTitle,
  checkTimerDraft,
} from "./schema";
import {
  advanceTurn,
  adjust,
  callTime,
  complete,
  impliedOvertimeMs,
  pause,
  reset,
  setRulesDismissed,
  start,
  startOvertime,
  type HubTimer,
  type TimerPatch,
} from "./timer";

/**
 * The store's controls.
 *
 * Every one of these is a public POST endpoint, so authorisation is
 * re-established here from the caller's own session rather than trusted
 * from the form — the same rule `src/lib/events/actions.ts` follows, and
 * for the same reason: an id in a hidden field is something the caller
 * chose.
 *
 * The display token appears nowhere in this file. It is a read-only
 * identifier for a television; it is not a credential and it can never
 * reach any of these.
 */

const CONTROL_PANEL = "/store/event-hub";

/** Whether the viewer may act on this store. Mirrors the events actions. */
async function authorizeStore(storeId: string): Promise<boolean> {
  const viewer = await getViewer();

  if (viewer.kind === "anonymous") redirect("/login?next=/store/event-hub");
  if (viewer.kind === "admin") return true;

  return viewer.kind === "store" && viewer.storeIds.includes(storeId);
}

/** The display, but only if this caller manages the store that owns it. */
async function authorizedDisplay(displayId: string): Promise<HubDisplay | null> {
  const display = await findDisplay(displayId);
  if (!display) return null;

  return (await authorizeStore(display.storeId)) ? display : null;
}

/**
 * The timer, its display, and permission — or nothing.
 *
 * Walked display-first so a forged timer id belonging to another store
 * fails on the store check rather than on the timer existing.
 */
async function authorizedTimer(
  timerId: string,
): Promise<{ timer: HubTimer; display: HubDisplay } | null> {
  const timer = await findTimer(timerId);
  if (!timer) return null;

  const display = await authorizedDisplay(timer.displayId);
  return display ? { timer, display } : null;
}

/* -------------------------------------------------------------------- */
/* The display                                                          */
/* -------------------------------------------------------------------- */

export async function createDisplayAction(formData: FormData): Promise<void> {
  const storeId = text(formData, "storeId");
  if (!storeId || !(await authorizeStore(storeId))) return;

  const viewer = await getViewer();

  await createDisplay({
    storeId,
    createdBy: viewer.kind === "anonymous" ? null : viewer.user.id,
    name: checkDisplayName(text(formData, "name")),
    nightTitle: checkNightTitle(text(formData, "nightTitle")),
  });

  revalidatePath(CONTROL_PANEL);
}

export async function updateDisplayAction(formData: FormData): Promise<void> {
  const display = await authorizedDisplay(text(formData, "displayId"));
  if (!display) return;

  /*
   * Only the fields the submitted form actually carries. A toggle form
   * that posts one checkbox must not blank the announcement, and
   * `formData.has` is the only honest way to tell "absent" from "empty".
   */
  await updateDisplay(display.id, {
    ...(formData.has("nightTitle")
      ? { nightTitle: checkNightTitle(text(formData, "nightTitle")) }
      : {}),
    ...(formData.has("announcement")
      ? { announcement: checkAnnouncement(text(formData, "announcement")) }
      : {}),
    ...(formData.has("layout")
      ? { layout: checkLayout(text(formData, "layout")) }
      : {}),
    /* `getAll`, not `get`: each checkbox is shadowed by a hidden "off"
       so an unticked box is distinguishable from an absent field, which
       means both values arrive and only the presence of "on" matters. */
    ...(formData.has("showFlares")
      ? { showFlares: formData.getAll("showFlares").includes("on") }
      : {}),
    ...(formData.has("showQr")
      ? { showQr: formData.getAll("showQr").includes("on") }
      : {}),
    ...(formData.has("soundEnabled")
      ? { soundEnabled: formData.getAll("soundEnabled").includes("on") }
      : {}),
  });

  revalidatePath(CONTROL_PANEL);
}

/**
 * Issues a new display token, retiring the old one immediately.
 *
 * What a store does the day a television leaves the building, or the day
 * somebody photographs the URL. The old link 404s from that moment.
 */
export async function rotateDisplayTokenAction(formData: FormData): Promise<void> {
  const display = await authorizedDisplay(text(formData, "displayId"));
  if (!display) return;

  await updateDisplay(display.id, { token: randomBytes(16).toString("hex") });

  revalidatePath(CONTROL_PANEL);
}

/* -------------------------------------------------------------------- */
/* Timers                                                               */
/* -------------------------------------------------------------------- */

export async function addTimerAction(formData: FormData): Promise<void> {
  const display = await authorizedDisplay(text(formData, "displayId"));
  if (!display) return;

  const checked = checkTimerDraft({
    game: text(formData, "game"),
    eventName: text(formData, "eventName"),
    round: text(formData, "round"),
    format: text(formData, "format"),
    bracket: text(formData, "bracket"),
    presetId: text(formData, "presetId"),
    customMinutes: text(formData, "customMinutes"),
  });

  if (!checked.ok) return;

  await addTimer({ displayId: display.id, ...checked.value });

  revalidatePath(CONTROL_PANEL);
}

export async function editTimerAction(formData: FormData): Promise<void> {
  const found = await authorizedTimer(text(formData, "timerId"));
  if (!found) return;

  const roundRaw = text(formData, "round").trim();
  const round = roundRaw ? Number(roundRaw) : null;

  await editTimer(found.timer.id, {
    ...(formData.has("eventName")
      ? {
          eventName:
            text(formData, "eventName").trim().slice(0, 60) || found.timer.eventName,
        }
      : {}),
    ...(formData.has("round")
      ? { round: Number.isInteger(round) && round! >= 1 && round! <= 99 ? round : null }
      : {}),
    ...(formData.has("bracket")
      ? {
          bracket: (text(formData, "bracket") === "elimination"
            ? "elimination"
            : "swiss") as Bracket,
        }
      : {}),
  });

  revalidatePath(CONTROL_PANEL);
}

export async function removeTimerAction(formData: FormData): Promise<void> {
  const found = await authorizedTimer(text(formData, "timerId"));
  if (!found) return;

  await removeTimer(found.timer.id);

  /* Positions close up behind it, so the wall has no gap where a
     tournament used to be. */
  const left = await listTimers(found.display.id);
  await reorderTimers(
    found.display.id,
    left.map((timer) => timer.id),
  );

  revalidatePath(CONTROL_PANEL);
}

/** Moves one panel along the wall. `direction` is -1 or 1. */
export async function moveTimerAction(formData: FormData): Promise<void> {
  const found = await authorizedTimer(text(formData, "timerId"));
  if (!found) return;

  const direction = text(formData, "direction") === "up" ? -1 : 1;
  const timers = await listTimers(found.display.id);
  const index = timers.findIndex((timer) => timer.id === found.timer.id);
  const target = index + direction;

  if (index < 0 || target < 0 || target >= timers.length) return;

  const ordered = [...timers];
  [ordered[index], ordered[target]] = [ordered[target], ordered[index]];

  await reorderTimers(
    found.display.id,
    ordered.map((timer) => timer.id),
  );

  revalidatePath(CONTROL_PANEL);
}

/**
 * Every transport control, in one action.
 *
 * One entry point rather than eleven, because the interesting part is
 * identical for all of them — establish who is asking, load the row,
 * compute the patch — and eleven copies of that is eleven places for the
 * authorisation check to drift.
 *
 * A transition returning null writes nothing. That is what makes a
 * double tap, a second staff phone, and a retried request all harmless:
 * starting a running timer is not an error, it is a no-op.
 */
export async function timerControlAction(formData: FormData): Promise<void> {
  const found = await authorizedTimer(text(formData, "timerId"));
  if (!found) return;

  const { timer } = found;
  const op = text(formData, "op");
  const now = Date.now();

  const procedure = procedureFor(GAME_PROFILES[timer.game as GameId], timer.bracket);

  let patch: TimerPatch | null = null;

  switch (op) {
    case "start":
      patch = start(timer, now);
      break;
    case "pause":
      patch = pause(timer, now);
      break;
    case "reset":
      patch = reset(timer);
      break;
    case "add-minute":
      patch = adjust(timer, 60_000, now);
      break;
    case "subtract-minute":
      patch = adjust(timer, -60_000, now);
      break;
    case "call-time":
      patch = callTime(timer, now);
      break;
    case "start-overtime": {
      /* The procedure decides the length, not the form — preset-aware,
         so Top Cut gets its 10:00. A turn-counted procedure gets null,
         and the display shows turns instead of a countdown it was never
         supposed to have. */
      const impliedMs = impliedOvertimeMs(timer);
      patch = startOvertime(timer, now, impliedMs === null ? null : impliedMs / 1000);
      break;
    }
    case "next-turn":
      patch = advanceTurn(timer, procedure.additionalTurns, 1, now);
      break;
    case "previous-turn":
      patch = advanceTurn(timer, procedure.additionalTurns, -1, now);
      break;
    case "dismiss-rules":
      patch = setRulesDismissed(timer, true);
      break;
    case "reopen-rules":
      patch = setRulesDismissed(timer, false);
      break;
    case "complete":
      patch = complete(timer);
      break;
    default:
      return;
  }

  if (!patch) return;

  await patchTimer(timer.id, patch);

  revalidatePath(CONTROL_PANEL);
}
