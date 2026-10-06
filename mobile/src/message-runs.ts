/**
 * How a conversation is drawn, Instagram's way: the same in the app and
 * on the website. This is src/lib/local/message-runs.ts, word for word,
 * and tests/unit/message-runs.test.ts walks both.
 *
 * The founder: "Profile pic should be shown on every message from
 * someone in a small circle, refer to instagram DM's as an example. Do
 * not show own profile pic in messages." Instagram shows the face once
 * per RUN of their messages, beside the last one, and tightens the gap
 * between messages in a run; a time line appears only where the talk
 * paused. That is what these flags say.
 */

/** A pause this long or longer starts a new run and earns a time line. */
export const RUN_GAP_MS = 15 * 60 * 1000;

export interface RunFlags {
  /** Draw the time above this message: the first, or after a pause. */
  showTime: boolean;
  /** Theirs, and the last of their run: the face goes beside it. */
  showFace: boolean;
  /** The next message continues the same run: draw them close. */
  joinsNext: boolean;
}

export function messageRuns(
  messages: readonly { yours: boolean; sentAt: string }[],
): RunFlags[] {
  const at = messages.map((message) => Date.parse(message.sentAt));
  const sameRun = (a: number, b: number) =>
    messages[a].yours === messages[b].yours &&
    Number.isFinite(at[a]) &&
    Number.isFinite(at[b]) &&
    Math.abs(at[b] - at[a]) < RUN_GAP_MS;

  return messages.map((message, index) => {
    const paused =
      index === 0 ||
      !Number.isFinite(at[index]) ||
      !Number.isFinite(at[index - 1]) ||
      at[index] - at[index - 1] >= RUN_GAP_MS;
    const joinsNext = index < messages.length - 1 && sameRun(index, index + 1);
    return {
      showTime: paused,
      showFace: !message.yours && !joinsNext,
      joinsNext,
    };
  });
}

/** The composer's height cap, in lines; past it, the box scrolls. */
export const COMPOSER_MAX_LINES = 5;

/** A message as it is sent: no blank lines piled at either end. */
export function tidyMessage(raw: string): string {
  return raw
    .replace(/^\s*\n+/, "")
    .replace(/\n[\s\n]*$/, "")
    .trim();
}
