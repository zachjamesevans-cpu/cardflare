import Link from "next/link";
import { ChevronDown } from "lucide-react";

import { EVENT_DETAILS } from "@/lib/events/night-copy";

/**
 * Event details, folded: the venue, the address, the organizer and the
 * code, for whoever needs them.
 *
 * The founder (2026-10-03): "EVENT DETAILS (collapsed by default) /
 * Venue / Address / Organizer / Rules/details / Event code." A native
 * `<details>`, so it opens without a script and a screen reader gets
 * the disclosure for free. The organizer is the store: a night is
 * posted by the shop that runs it. The app's event-details.tsx draws
 * the same four rows behind the same tap; tests/unit/nights2-parity
 * .test.ts holds the two together.
 */
export function EventDetails({
  storeId,
  storeName,
  address,
  code,
}: {
  storeId: string;
  storeName: string;
  /** The street address, or the city and region, or null when the shop has said neither. */
  address: string | null;
  code: string;
}) {
  const rows: { label: string; value: React.ReactNode }[] = [
    {
      label: "Venue",
      value: (
        <Link href={`/s/${storeId}`} className="underline-offset-4 hover:underline">
          {storeName}
        </Link>
      ),
    },
    ...(address ? [{ label: "Address", value: address }] : []),
    { label: "Organizer", value: storeName },
    {
      label: "Event code",
      value: <span className="font-mono tracking-wide">{code}</span>,
    },
  ];

  return (
    <details className="group flex flex-col gap-2 border-t border-border pt-3">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-xs font-semibold tracking-wide text-text-muted uppercase [&::-webkit-details-marker]:hidden">
        {EVENT_DETAILS}
        <ChevronDown
          className="size-4 transition-transform group-open:rotate-180"
          aria-hidden="true"
        />
      </summary>
      <dl className="mt-2 flex flex-col gap-1.5 text-sm">
        {rows.map((row) => (
          <div key={row.label} className="flex gap-3">
            <dt className="w-24 shrink-0 text-text-muted">{row.label}</dt>
            <dd className="min-w-0 text-text-primary">{row.value}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}
