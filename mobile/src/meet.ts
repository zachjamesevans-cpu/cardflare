/**
 * The words for a meet-up suggestion, shared by the website's thread
 * view and the app's (src/lib/nearby/meet.ts is the original; keep them twins).
 */
export interface MeetLike {
  storeName: string;
  nextEventName: string | null;
  nextEventAt: string | null;
  timeZone: string;
  shared: boolean;
}

/** "You both go to X. Their next night is Friday 6pm." */
export function meetLine(meet: MeetLike): string {
  const who = meet.shared
    ? `You both go to ${meet.storeName}.`
    : `You go to ${meet.storeName}.`;
  const when = meet.nextEventAt
    ? ` Next up: ${eventWhen(meet)}.`
    : " Walk in any time.";
  return who + when;
}

/** The message the chip writes: appended to a draft, or the whole of one. */
export function suggestText(draft: string, meet: MeetLike): string {
  const when = meet.nextEventAt ? ` on ${eventWhen(meet)}` : "";
  const line = `Want to meet at ${meet.storeName}${when}?`;
  const trimmed = draft.trim();
  return trimmed ? `${trimmed} ${line}` : line;
}

function eventWhen(meet: MeetLike): string {
  if (!meet.nextEventAt) return "";
  const at = new Date(meet.nextEventAt);
  const day = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    hour: "numeric",
    minute: "2-digit",
    timeZone: meet.timeZone,
  }).format(at);
  return meet.nextEventName ? `${meet.nextEventName}, ${day}` : day;
}
