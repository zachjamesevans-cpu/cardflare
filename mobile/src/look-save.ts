import { useSyncExternalStore } from "react";

import { ApiError, setCustomizeEquip, type CustomizeKind, type Profile } from "./api";
import type { ArtFile } from "./cosmetic-film";

/**
 * Your look, saved the way a deleted Flare is: at once on screen, on the
 * server behind it, and put back if the server says no.
 *
 * The founder: "i think we need a 'done' button... the second i press
 * done or whatever, it updates on my account and the server stuff
 * happens in the background. if it doesn't save, it'll just revert
 * back." The Look and Showcase tabs of Edit profile stage picks; Done
 * hands them here and leaves. The profile draws the PENDING look over
 * whatever it reads until the writes settle, so a re-read that beats
 * the server cannot flash the old look back. When they settle the
 * pending look goes, the profile reads again, and that read is the
 * truth: what saved shows, what did not is back as it was, with a line
 * saying so.
 */

/** The slots that changed, as the slug now worn or null for none. */
export type LookDraft = Partial<Record<CustomizeKind, string | null>>;

/** A dropped-in ring or aura is a file the avatar needs, not a slug. */
export interface LookArt {
  ringArt?: ArtFile | null;
  auraArt?: ArtFile | null;
}

export interface PendingLook extends LookArt {
  equips: LookDraft;
}

interface LookState {
  pending: PendingLook | null;
  /** Said once on the profile when a save did not take, then cleared. */
  failed: string | null;
  /** Bumped when a save settles, so a screen knows to read again. */
  settled: number;
}

export const LOOK_FAILED = "Your look did not save, so it is back as it was. Try again.";
export const LOOK_NOT_PRO = "Wearing cosmetics is a cardflare Pro feature.";

let state: LookState = { pending: null, failed: null, settled: 0 };
const listeners = new Set<() => void>();

function set(next: Partial<LookState>) {
  state = { ...state, ...next };
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function usePendingLook(): LookState {
  return useSyncExternalStore(subscribe, () => state);
}

/** The store as it stands, outside React: for tests. */
export const lookState = (): LookState => state;

export function clearLookMessage() {
  if (state.failed) set({ failed: null });
}

/**
 * Wears `draft` now and saves it behind. One slot at a time, in order,
 * so two slots never race; a slot that fails does not stop the rest.
 * `send` is the write, swappable for a test.
 */
export async function saveLook(
  draft: LookDraft,
  art: LookArt = {},
  send: (kind: CustomizeKind, slug: string | null) => Promise<unknown> = setCustomizeEquip,
): Promise<boolean> {
  const kinds = Object.keys(draft) as CustomizeKind[];
  if (kinds.length === 0) return true;

  set({ pending: { equips: { ...draft }, ...art }, failed: null });

  let failed: string | null = null;
  for (const kind of kinds) {
    try {
      await send(kind, draft[kind] ?? null);
    } catch (caught) {
      failed =
        caught instanceof ApiError && caught.code === "not-pro" ? LOOK_NOT_PRO : LOOK_FAILED;
    }
  }

  /*
   * A failure puts the old look back at once. A success keeps the new
   * one on screen until the profile's re-read has landed (lookLanded):
   * that read can take many seconds, and clearing here showed the old
   * look for all of them, as though Done had not saved.
   */
  set({ pending: failed ? null : state.pending, failed, settled: state.settled + 1 });
  return failed === null;
}

/**
 * The profile has read the server since save number `round` settled,
 * so the server's look is the saved one and the pending one can go.
 * A later save keeps its own pending look.
 */
export function lookLanded(round: number) {
  if (state.pending && state.settled === round) set({ pending: null });
}

/** A profile wearing the pending look over what it was read with. */
export function wearPending<P extends Pick<Profile, "wear" | "equips">>(
  profile: P,
  pending: PendingLook | null,
): P {
  if (!pending) return profile;
  const { equips } = pending;
  const wear = profile.wear ?? { ring: null, aura: null, ringArt: null, auraArt: null };
  return {
    ...profile,
    equips: { ...profile.equips, ...equips },
    wear: {
      ring: "ring" in equips ? (equips.ring ?? null) : wear.ring,
      aura: "aura" in equips ? (equips.aura ?? null) : wear.aura,
      ringArt: "ring" in equips ? (pending.ringArt ?? null) : wear.ringArt,
      auraArt: "aura" in equips ? (pending.auraArt ?? null) : wear.auraArt,
    },
  };
}
