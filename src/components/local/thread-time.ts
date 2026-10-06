/**
 * The time line between runs of a conversation, Instagram's way: a clock
 * time, with the day only when it is not today. "3:04 PM", "Yesterday
 * 3:04 PM", "Fri 3:04 PM" within the week, "Sep 12, 3:04 PM" before
 * that. Only drawn where `messageRuns` says the talk paused, so the
 * conversation is not stamped on every bubble.
 *
 * Read in the browser only: a thread is loaded on the client, so the
 * reader's own clock is the one asked.
 */
export function threadTimeLabel(
  iso: string,
  now: Date = new Date(),
  timeZone?: string,
): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "";

  const clock = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  }).format(at);

  const dayKey = (date: Date) =>
    new Intl.DateTimeFormat("en-CA", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      timeZone,
    }).format(date);

  const today = dayKey(now);
  if (dayKey(at) === today) return clock;

  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  if (dayKey(at) === dayKey(yesterday)) return `Yesterday ${clock}`;

  const days = (now.getTime() - at.getTime()) / (24 * 60 * 60 * 1000);
  if (days >= 0 && days < 7) {
    const weekday = new Intl.DateTimeFormat("en-US", {
      weekday: "short",
      timeZone,
    }).format(at);
    return `${weekday} ${clock}`;
  }

  const date = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone,
  }).format(at);
  return `${date}, ${clock}`;
}
