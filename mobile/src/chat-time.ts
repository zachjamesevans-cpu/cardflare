/**
 * The time line between runs of a conversation, Instagram's way: a clock
 * time, with the day only when it is not today. "3:04 PM", "Yesterday
 * 3:04 PM", "Fri 3:04 PM" within the week, "Sep 12, 3:04 PM" before
 * that. Only drawn where `messageRuns` says the talk paused, so the
 * conversation is not stamped on every bubble.
 *
 * The website's src/components/local/thread-time.ts, natively, in the
 * reader's own clock.
 */
export function chatTimeLine(iso: string, now: Date = new Date()): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "";

  const clock = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(at);

  const dayKey = (date: Date) =>
    `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;

  if (dayKey(at) === dayKey(now)) return clock;

  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  if (dayKey(at) === dayKey(yesterday)) return `Yesterday ${clock}`;

  const days = (now.getTime() - at.getTime()) / (24 * 60 * 60 * 1000);
  if (days >= 0 && days < 7) {
    const weekday = new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(at);
    return `${weekday} ${clock}`;
  }

  const date = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(at);
  return `${date}, ${clock}`;
}
